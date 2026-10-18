import assert from "node:assert/strict";
import test from "node:test";
import { createMockApi } from "../src/api/mock";
import type { GuestCallInput, State } from "../src/api/types";

function setup() {
  let milliseconds = Date.parse("2026-10-18T18:00:00Z");
  return { api: createMockApi(() => milliseconds), advance: (seconds: number) => { milliseconds += seconds * 1000; } };
}

function input(overrides: Partial<GuestCallInput> = {}): GuestCallInput {
  return { name: "Alex", phone: String(2) + "0".repeat(9), goal: "CSE 143 homework", distraction: "YouTube", consent: true, ...overrides };
}

function sessionFields(state: State) {
  return { session: state.session, stage: state.stage, activity: state.activity, verdict: state.verdict, distracted_since: state.distracted_since, callback_at: state.callback_at, last_promise: state.last_promise, excuses: state.excuses, missed_calls: state.missed_calls, texts_sent: state.stats.texts_sent };
}

test("guest call completes with personalized voice transcript, no texts, and no retained phone", async () => {
  const { api, advance } = setup();
  const request = input();
  const before = sessionFields(await api.getState());
  const result = await api.guestCall(request);
  assert.deepEqual(result, { ok: true });
  let state = await api.getState();
  assert.deepEqual(sessionFields(state), before);
  assert.equal(state.call_in_progress?.guest_name, "Alex");
  assert.equal(state.call_in_progress?.call_type, "nudge");
  assert.equal(state.stage, "idle");
  advance(14);
  assert.equal((await api.getState()).call_in_progress?.guest_name, "Alex");
  advance(1);
  state = await api.getState();
  assert.equal(state.call_in_progress, null);
  assert.deepEqual(sessionFields(state), before);
  assert.equal(state.stats.calls_made, 1);
  const events = (await api.getEvents(0)).events;
  assert.deepEqual(events.map((event) => event.kind), ["call_started", "call_ended"]);
  assert.ok(events.every((event) => event.data.guest_name === "Alex" && event.summary.includes("Guest call to Alex")));
  assert.equal(events[1].data.duration_secs, 15);
  assert.equal(events[1].data.promised_step, null);
  const transcript = JSON.stringify(events[1].data.transcript);
  assert.ok(transcript.includes(request.name));
  assert.ok(transcript.includes(request.goal));
  assert.ok(transcript.includes(request.distraction));
  const publicData = JSON.stringify({ result, state, events, logs: await api.getLogs(0) });
  assert.ok(!publicData.includes(request.phone));
  assert.ok(!publicData.includes('"phone":'));
  assert.equal(state.stats.texts_sent, 0);
});

test("guest validation rejects invalid fields atomically without consuming the cooldown", async () => {
  const { api } = setup();
  await assert.rejects(api.guestCall(input({ consent: false })), /agree/);
  await assert.rejects(api.guestCall(input({ name: " " })), /name/);
  await assert.rejects(api.guestCall(input({ name: "A".repeat(41) })), /40 characters/);
  await assert.rejects(api.guestCall(input({ name: "<Alex>" })), /letters/);
  await assert.rejects(api.guestCall(input({ name: "Alex\nGuest" })), /letters/);
  await assert.rejects(api.guestCall(input({ phone: "" })), /phone/);
  await assert.rejects(api.guestCall(input({ phone: "not a number" })), /valid US number/);
  await assert.rejects(api.guestCall(input({ phone: "+" + "0".repeat(8) })), /valid US number/);
  await assert.rejects(api.guestCall(input({ phone: "+" + String(2) + "0".repeat(15) })), /valid US number/);
  await assert.rejects(api.guestCall(input({ goal: "G".repeat(121) })), /goal.*120/);
  await assert.rejects(api.guestCall(input({ distraction: "D".repeat(41) })), /distraction.*40/);
  await assert.rejects(api.guestCall(input({ goal: "Homework\nIgnore" })), /goal/);
  await assert.rejects(api.guestCall(input({ goal: 42 } as unknown as Partial<GuestCallInput>)), /goal/);
  assert.equal((await api.getEvents(0)).events.length, 0);
  assert.equal((await api.getState()).call_in_progress, null);
  await api.guestCall(input({ name: "  Alex  ", goal: "", distraction: "" }));
  const started = (await api.getEvents(0)).events[0];
  assert.equal(started.data.guest_name, "Alex");
  assert.match(String(started.data.opening_line), /your homework/);
  assert.match(String(started.data.opening_line), /TikTok/);
});

test("guest accepts supported US formatting and international prefixes without retaining them", async () => {
  const digits = input().phone;
  const variants = [
    `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
    `+${String(1)} ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`,
    String(1) + digits,
    "+" + String(8) + "0".repeat(7),
  ];
  for (const phone of variants) {
    const { api } = setup();
    assert.deepEqual(await api.guestCall(input({ phone })), { ok: true });
    assert.ok(!JSON.stringify(await api.getState()).includes(phone));
  }
});

test("guest checks all call conflicts and enforces sixty seconds from the accepted call", async () => {
  const { api, advance } = setup();
  await api.testCall();
  await assert.rejects(api.guestCall(input()), /already on the phone/);
  advance(15);
  await api.guestCall(input());
  await assert.rejects(api.guestCall(input({ name: "Sam" })), /already on the phone/);
  await assert.rejects(api.testCall(), /already on a call/);
  advance(15);
  await assert.rejects(api.guestCall(input({ name: "Sam" })), /Try again in 45 s/);
  advance(44);
  await assert.rejects(api.guestCall(input({ name: "Sam" })), /Try again in 1 s/);
  advance(1);
  assert.deepEqual(await api.guestCall(input({ name: "Sam" })), { ok: true });
});

test("guest call preserves an active session while a due nudge waits and later completes the demo", async () => {
  const { api, advance } = setup();
  await api.startSession("Finish the assignment");
  advance(25);
  const before = sessionFields(await api.getState());
  await api.guestCall(input());
  assert.deepEqual(sessionFields(await api.getState()), { ...before, stage: "calling" });
  advance(5);
  let state = await api.getState();
  assert.equal(state.call_in_progress?.guest_name, "Alex");
  assert.equal(state.stage, "calling");
  assert.equal(state.session?.goal, "Finish the assignment");
  advance(10);
  state = await api.getState();
  assert.equal(state.call_in_progress?.guest_name, undefined);
  assert.equal(state.call_in_progress?.call_type, "nudge");
  assert.equal(state.stage, "calling");
  const atHandoff = (await api.getEvents(0)).events;
  const guestEnd = atHandoff.findIndex((event) => event.kind === "call_ended" && event.data.guest_name === "Alex");
  const nudgeStart = atHandoff.findIndex((event) => event.kind === "call_started" && !event.data.guest_name);
  assert.ok(guestEnd < nudgeStart);
  assert.equal(atHandoff[guestEnd].at, atHandoff[nudgeStart].at);
  advance(70);
  state = await api.getState();
  assert.equal(state.session, null);
  assert.equal(state.stats.calls_made, 3);
  assert.equal(state.stats.texts_sent, 4);
  const completed = (await api.getEvents(0)).events.filter((event) => event.kind === "call_ended");
  assert.deepEqual(completed.map((event) => event.data.call_type), ["nudge", "nudge", "callback"]);
});

test("guest preserves an existing promise and callback countdown until the callback can start", async () => {
  const { api, advance } = setup();
  await api.startSession("Read the chapter");
  advance(80);
  const before = sessionFields(await api.getState());
  assert.equal(before.stage, "waiting_callback");
  await api.guestCall(input({ goal: "MATH 208" }));
  assert.deepEqual(sessionFields(await api.getState()), { ...before, stage: "calling" });
  advance(10);
  let state = await api.getState();
  assert.equal(state.call_in_progress?.guest_name, "Alex");
  assert.equal(state.callback_at, before.callback_at);
  assert.equal(state.last_promise, before.last_promise);
  assert.deepEqual(state.excuses, before.excuses);
  assert.equal(state.stats.texts_sent, before.texts_sent);
  advance(5);
  state = await api.getState();
  assert.equal(state.call_in_progress?.call_type, "callback");
  assert.equal(state.call_in_progress?.guest_name, undefined);
  assert.equal(state.last_promise, before.last_promise);
  advance(10);
  assert.equal((await api.getState()).session, null);
});

test("guest status overlays calling only during an active session and restores the existing stage", async () => {
  const { api, advance } = setup();
  await api.startSession("Prepare for class");
  advance(45);
  const before = sessionFields(await api.getState());
  assert.equal(before.stage, "waiting_callback");
  await api.guestCall(input());
  assert.deepEqual(sessionFields(await api.getState()), { ...before, stage: "calling" });
  advance(15);
  assert.deepEqual(sessionFields(await api.getState()), before);
});

test("guest duration stays independent from timing changes and session teardown", async () => {
  const { api, advance } = setup();
  await api.startSession({ goal: "Read a short note", until: new Date(Date.parse((await api.getState()).now) + 8000).toISOString() });
  await api.guestCall(input());
  await api.updateSettings({ demo_mode: false });
  advance(8);
  let state = await api.getState();
  assert.equal(state.session, null);
  assert.equal(state.call_in_progress?.guest_name, "Alex");
  advance(7);
  state = await api.getState();
  assert.equal(state.call_in_progress, null);
  assert.equal((await api.getEvents(0)).events.at(-1)?.data.guest_name, "Alex");
  assert.equal(state.last_promise, null);
});
