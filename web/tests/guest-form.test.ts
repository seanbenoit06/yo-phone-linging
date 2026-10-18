import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockApi } from '../src/api/mock';
import type { Event, Task } from '../src/api/types';
import { advanceGuestAttempt, beginGuestAttempt, createGuestRequestGuard, guestGoalSuggestions, parseGuestPhone, safeGuestError, validateGuestForm } from '../src/desktop/guestModel';
import type { GuestForm } from '../src/desktop/guestModel';

function generatedUs() {
  return [String(200 + 2), String(500 + 55), String(120 + 3).padStart(4, '0')].join('');
}

function validForm(): GuestForm {
  return { name: 'Alex', phone: generatedUs(), goal: 'CSE homework', distraction: 'TikTok', consent: true };
}

const requestedAt = '2026-10-18T12:00:00Z';

function event(id: number, kind: Event['kind'], name: string, at = requestedAt): Event {
  return { id, kind, at, summary: 'Guest call event', data: { guest_name: name } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test('guest form normalizes common US formats without storing fixture numbers in source', () => {
  const digits = generatedUs();
  const expected = `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  const variants = [digits, `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`, `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`, `1${digits}`];
  for (const value of variants) {
    assert.deepEqual(parseGuestPhone(value), { valid: true, canonical: `+1${digits}`, display: expected });
  }
});

test('international numbers require a leading plus and between eight and fifteen digits', () => {
  const digits = String(40 + 4) + generatedUs();
  assert.equal(parseGuestPhone(`+${digits}`).canonical, `+${digits}`);
  assert.equal(parseGuestPhone(`+${digits}`).display, `+${digits}`);
  assert.equal(parseGuestPhone(digits).valid, false);
  assert.equal(parseGuestPhone(`+${'2'.repeat(7)}`).valid, false);
  assert.equal(parseGuestPhone(`+${'2'.repeat(16)}`).valid, false);
  assert.equal(parseGuestPhone(`+0${'2'.repeat(8)}`).valid, false);
  assert.equal(parseGuestPhone(`0${generatedUs().slice(1)}`).valid, false);
  assert.equal(parseGuestPhone(`1${generatedUs().slice(1)}`).valid, false);
  assert.equal(parseGuestPhone(`${generatedUs()} ext. 2`).valid, false);
  assert.equal(parseGuestPhone(`++${digits}`).valid, false);
});

test('required consent and name cannot be bypassed, and blank optional goal gets the documented default', () => {
  const missing = validateGuestForm({ ...validForm(), name: ' ', phone: '', consent: false });
  assert.equal(missing.payload, null);
  assert.deepEqual(Object.keys(missing.errors), ['name', 'phone', 'consent']);
  const accepted = validateGuestForm({ ...validForm(), name: ' Alex ', goal: ' ' });
  assert.equal(accepted.payload?.name, 'Alex');
  assert.equal(accepted.payload?.goal, 'your homework');
  assert.equal(accepted.payload?.consent, true);
  assert.equal(accepted.payload?.phone, parseGuestPhone(generatedUs()).canonical);
});

test('name and goal length limits apply before requests, and unsafe name characters are rejected', () => {
  assert.ok(validateGuestForm({ ...validForm(), name: 'a'.repeat(41) }).errors.name);
  assert.ok(validateGuestForm({ ...validForm(), goal: 'a'.repeat(121) }).errors.goal);
  assert.equal(validateGuestForm({ ...validForm(), name: 'a'.repeat(40), goal: 'b'.repeat(120) }).payload?.name.length, 40);
  for (const name of ['Alex<', 'Alex>', '{Alex}', 'Al\u0000ex', 'Al\u200bex']) assert.ok(validateGuestForm({ ...validForm(), name }).errors.name);
  const internationalName = '\u738b\u540c\u5b78';
  assert.equal(validateGuestForm({ ...validForm(), name: internationalName }).payload?.name, internationalName);
});

test('goal suggestions deduplicate available task contexts and preserve both default suggestions', () => {
  const contexts = ['MATH 208', 'INFO 200', 'MATH 208', ' '];
  const tasks: Task[] = contexts.map((context, id) => ({ id: String(id), source: 'canvas', title: 'Assignment', context, due_at: null, url: null, points: null }));
  assert.deepEqual(guestGoalSuggestions(tasks), ['MATH 208', 'INFO 200', 'CSE 143 homework', 'Studying for the midterm']);
});

test('server errors keep their useful explanation while removing formatted and canonical phone values', () => {
  const phone = generatedUs();
  const parsed = parseGuestPhone(phone);
  for (const format of [phone, parsed.display, parsed.canonical]) {
    const safe = safeGuestError(new Error(`Cannot call ${format}; wait before trying again.`), parsed.canonical);
    assert.match(safe, /wait before trying again/);
    assert.doesNotMatch(safe, new RegExp(phone));
    assert.ok(!safe.includes(format));
    assert.match(safe, /phone hidden/);
  }
  assert.equal(safeGuestError(new Error('Please wait 60 seconds before another guest call.'), phone), 'Please wait 60 seconds before another guest call.');
});

test('an accepted request without a matching call is awaiting status, never prematurely ended', async () => {
  const state = await createMockApi().getState();
  state.call_in_progress = null;
  const previous = [event(8, 'call_ended', 'Alex')];
  const attempt = beginGuestAttempt('Alex', previous, requestedAt);
  assert.equal(advanceGuestAttempt(attempt, state, previous, true).phase, 'awaiting');
  assert.equal(advanceGuestAttempt(attempt, null, [], false).phase, 'awaiting');
  assert.equal(advanceGuestAttempt(attempt, state, [event(9, 'call_ended', 'Sam')], true).phase, 'awaiting');
});

test('a new guest start supports dialing without pretending that an absent state means it ended', async () => {
  const state = await createMockApi().getState();
  state.call_in_progress = null;
  const attempt = beginGuestAttempt('Alex', [], requestedAt);
  const started = advanceGuestAttempt(attempt, state, [event(1, 'call_started', 'Alex')], true);
  assert.equal(started.phase, 'dialing');
  assert.equal(advanceGuestAttempt(started, state, [], true).phase, 'dialing');
  assert.equal(advanceGuestAttempt(started, state, [event(1, 'call_started', 'Alex'), event(2, 'call_ended', 'Alex')], true).phase, 'ended');
});

test('guest status follows matching call identity independently of the session escalation stage', async () => {
  const state = await createMockApi().getState();
  state.stage = 'idle';
  state.session = null;
  state.call_in_progress = { call_type: 'nudge', started_at: '2026-10-18T12:00:00Z', guest_name: 'Alex' };
  const active = advanceGuestAttempt(beginGuestAttempt('Alex', [], requestedAt), state, [], true);
  assert.equal(active.phase, 'calling');
  assert.equal(active.startedAt, state.call_in_progress.started_at);
  state.call_in_progress = null;
  assert.equal(advanceGuestAttempt(active, state, [], false).phase, 'calling');
  assert.equal(advanceGuestAttempt(active, state, [], true).phase, 'ended');
});

test('a replacement call cannot make its later disappearance complete the original guest request', async () => {
  const state = await createMockApi().getState();
  state.call_in_progress = { call_type: 'nudge', started_at: '2026-10-18T12:00:00Z', guest_name: 'Alex' };
  const active = advanceGuestAttempt(beginGuestAttempt('Alex', [], requestedAt), state, [], true);
  state.call_in_progress = { call_type: 'callback', started_at: '2026-10-18T12:01:00Z' };
  const replaced = advanceGuestAttempt(active, state, [], true);
  assert.equal(replaced.phase, 'awaiting-end');
  assert.equal(replaced.canFinishOnGone, false);
  state.call_in_progress = null;
  assert.equal(advanceGuestAttempt(replaced, state, [], true).phase, 'awaiting-end');
  assert.equal(advanceGuestAttempt(replaced, state, [event(1, 'call_started', 'Alex'), event(2, 'call_ended', 'Alex')], true).phase, 'ended');
});

test('a fast completed guest call is recognized from its new end event even without observing active state', async () => {
  const state = await createMockApi().getState();
  state.call_in_progress = null;
  const attempt = beginGuestAttempt('Alex', [event(10, 'call_started', 'Someone else')], requestedAt);
  assert.equal(advanceGuestAttempt(attempt, state, [event(9, 'call_ended', 'Alex')], true).phase, 'awaiting');
  assert.equal(advanceGuestAttempt(attempt, state, [event(11, 'call_ended', 'Alex')], true).phase, 'awaiting');
  assert.equal(advanceGuestAttempt(attempt, state, [event(11, 'call_started', 'Alex'), event(12, 'call_ended', 'Alex')], true).phase, 'ended');
});

test('late events for an earlier same-name call cannot finish the new request', async () => {
  const state = await createMockApi().getState();
  state.call_in_progress = null;
  const attempt = beginGuestAttempt('Alex', [], requestedAt);
  const oldStart = event(1, 'call_started', 'Alex', '2026-10-18T11:58:00Z');
  const oldEnd = event(2, 'call_ended', 'Alex', '2026-10-18T11:59:00Z');
  assert.equal(advanceGuestAttempt(attempt, state, [oldStart, oldEnd], true).phase, 'awaiting');
  const freshStart = event(3, 'call_started', 'Alex', '2026-10-18T12:00:01Z');
  const lateOldEnd = { ...oldEnd, id: 4 };
  assert.equal(advanceGuestAttempt(attempt, state, [freshStart, lateOldEnd], true).phase, 'dialing');
  state.call_in_progress = { call_type: 'nudge', started_at: freshStart.at, guest_name: 'Alex' };
  assert.equal(advanceGuestAttempt(attempt, state, [oldStart, freshStart, lateOldEnd], true).phase, 'calling');
});

test('currently matching active state wins over event completion from another same-name call', async () => {
  const state = await createMockApi().getState();
  state.call_in_progress = { call_type: 'nudge', started_at: requestedAt, guest_name: 'Alex' };
  const attempt = beginGuestAttempt('Alex', [], requestedAt);
  const result = advanceGuestAttempt(attempt, state, [event(1, 'call_started', 'Alex'), event(2, 'call_ended', 'Alex')], true);
  assert.equal(result.phase, 'calling');
  assert.equal(result.canFinishOnGone, true);
});

test('duplicate final-confirm clicks produce only one request while it is pending', async () => {
  const pending = deferred<{ ok: boolean }>();
  const guard = createGuestRequestGuard();
  let requests = 0;
  let accepted = 0;
  const action = () => { requests += 1; return pending.promise; };
  const first = guard.run(action, () => { accepted += 1; }, () => assert.fail('Unexpected failure'));
  assert.equal(guard.pending, true);
  assert.equal(await guard.run(action, () => { accepted += 1; }, () => assert.fail('Unexpected failure')), false);
  pending.resolve({ ok: true });
  await first;
  assert.equal(requests, 1);
  assert.equal(accepted, 1);
  assert.equal(guard.pending, false);
  guard.dispose();
});

test('source switch or unmount prevents stale success callbacks and a new source can operate independently', async () => {
  const pending = deferred<{ ok: boolean }>();
  const old = createGuestRequestGuard();
  let oldCallbacks = 0;
  const request = old.run(() => pending.promise, () => { oldCallbacks += 1; }, () => { oldCallbacks += 1; });
  old.dispose();
  const current = createGuestRequestGuard();
  let currentCallbacks = 0;
  await current.run(async () => ({ ok: true }), () => { currentCallbacks += 1; }, () => assert.fail('Unexpected failure'));
  pending.resolve({ ok: true });
  await request;
  assert.equal(oldCallbacks, 0);
  assert.equal(currentCallbacks, 1);
  assert.equal(await old.run(async () => ({ ok: true }), () => assert.fail('Disposed request'), () => assert.fail('Disposed error')), false);
  current.dispose();
});

test('a late rejection from a disposed request never leaks into the new form', async () => {
  const pending = deferred<never>();
  const guard = createGuestRequestGuard();
  let errors = 0;
  const request = guard.run(() => pending.promise, () => assert.fail('Unexpected acceptance'), () => { errors += 1; });
  guard.dispose();
  pending.reject(new Error('Old source rejected the request.'));
  await request;
  assert.equal(errors, 0);
});
