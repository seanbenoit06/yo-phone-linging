import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsController, type SettingsSnapshot } from '../src/api/settings';
import type { Settings, SettingsResponse } from '../src/api/types';

const defaults: Settings = { screen_monitoring: true, screenshots: true, webcam: false, detector_mode: 'relaxed', detector_llm: 'gemini', demo_mode: true };
const response = (patch: Partial<Settings> = {}): SettingsResponse => ({ settings: { ...defaults, ...patch }, available: { screen: true, webcam: true }, unavailable_reason: {} });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('settings are not optimistic, overlapping writes are blocked, and stale state cannot undo an acknowledgement', async () => {
  const gate = deferred<{ ok: true } & SettingsResponse>();
  const updates: SettingsSnapshot[] = [];
  const requests: Partial<Settings>[] = [];
  const controller = createSettingsController({ getSettings: async () => response(), updateSettings: (patch) => { requests.push(patch); return gate.promise; } }, (snapshot) => updates.push(snapshot));
  await controller.reload();
  const save = controller.update({ webcam: true });
  assert.equal(controller.getSnapshot().data?.settings.webcam, false);
  assert.equal(controller.getSnapshot().saving, 'webcam');
  assert.equal(await controller.update({ demo_mode: false }), false);
  assert.deepEqual(requests, [{ webcam: true }]);
  controller.sync({ ...defaults, webcam: false });
  gate.resolve({ ok: true as const, ...response({ webcam: true }) });
  assert.equal(await save, true);
  assert.equal(controller.getSnapshot().savedKey, 'webcam');
  controller.sync(defaults);
  assert.equal(controller.getSnapshot().data?.settings.webcam, true);
  controller.sync({ ...defaults, webcam: true });
  controller.sync({ ...defaults, webcam: true, detector_mode: 'lockin' });
  assert.equal(controller.getSnapshot().data?.settings.detector_mode, 'lockin');
  assert.equal(updates.at(-1)?.saving, null);
});

test('failed settings writes retain acknowledged values and allow a retry', async () => {
  let rejectWrite = true;
  const controller = createSettingsController({ getSettings: async () => response(), updateSettings: async (patch) => {
    if (rejectWrite) throw new Error('Camera is not available on this computer.');
    return { ok: true as const, ...response(patch) };
  } }, () => undefined);
  await controller.reload();
  assert.equal(await controller.update({ webcam: true }), false);
  assert.equal(controller.getSnapshot().data?.settings.webcam, false);
  assert.equal(controller.getSnapshot().errorKey, 'webcam');
  assert.match(controller.getSnapshot().error || '', /Camera is not available/);
  assert.equal(controller.getSnapshot().savedKey, null);
  assert.equal(controller.getSnapshot().saving, null);
  rejectWrite = false;
  assert.equal(await controller.update({ webcam: true }), true);
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().data?.settings.webcam, true);
});

test('source teardown discards delayed settings reads and writes without refreshing the new source', async () => {
  const read = deferred<SettingsResponse>();
  const readUpdates: SettingsSnapshot[] = [];
  const oldReader = createSettingsController({ getSettings: () => read.promise, updateSettings: async () => ({ ok: true as const, ...response() }) }, (snapshot) => readUpdates.push(snapshot));
  const loading = oldReader.reload();
  oldReader.stop();
  read.resolve(response());
  await loading;
  assert.equal(readUpdates.length, 1);
  assert.equal(readUpdates[0].data, null);

  const write = deferred<{ ok: true } & SettingsResponse>();
  let refreshes = 0;
  const writeUpdates: SettingsSnapshot[] = [];
  const oldWriter = createSettingsController({ getSettings: async () => response(), updateSettings: () => write.promise }, (snapshot) => writeUpdates.push(snapshot), async () => { refreshes += 1; });
  await oldWriter.reload();
  const saving = oldWriter.update({ detector_mode: 'lockin' });
  const updateCount = writeUpdates.length;
  oldWriter.stop();
  write.resolve({ ok: true as const, ...response({ detector_mode: 'lockin' }) });
  assert.equal(await saving, false);
  assert.equal(writeUpdates.length, updateCount);
  assert.equal(refreshes, 0);
});

test('settings reload is deduplicated, keeps the previous values on failure, and exposes unavailable reasons', async () => {
  const initial = response();
  initial.available.webcam = false;
  initial.unavailable_reason.webcam = 'No camera driver is installed.';
  const next = deferred<SettingsResponse>();
  let calls = 0;
  const controller = createSettingsController({ getSettings: () => { calls += 1; return calls === 1 ? Promise.resolve(initial) : next.promise; }, updateSettings: async () => ({ ok: true as const, ...initial }) }, () => undefined);
  await controller.reload();
  assert.equal(controller.getSnapshot().data?.unavailable_reason.webcam, 'No camera driver is installed.');
  const first = controller.reload();
  const second = controller.reload();
  assert.equal(first, second);
  assert.equal(calls, 2);
  assert.equal(await controller.update({ webcam: true }), false);
  next.reject(new Error('Settings service is offline.'));
  await first;
  assert.equal(controller.getSnapshot().loading, false);
  assert.equal(controller.getSnapshot().data?.available.webcam, false);
  assert.equal(controller.getSnapshot().error, 'Settings service is offline.');
});

test('a dashboard refresh failure preserves saved settings and reports that only the refresh failed', async () => {
  const controller = createSettingsController({ getSettings: async () => response(), updateSettings: async (patch) => ({ ok: true as const, ...response(patch) }) }, () => undefined, async () => { throw new Error('Offline'); });
  await controller.reload();
  assert.equal(await controller.update({ demo_mode: false }), true);
  assert.equal(controller.getSnapshot().data?.settings.demo_mode, false);
  assert.equal(controller.getSnapshot().savedKey, 'demo_mode');
  assert.match(controller.getSnapshot().error || '', /Saved, but the live dashboard/);
  controller.sync(defaults);
  assert.equal(controller.getSnapshot().data?.settings.demo_mode, false);
});

test('an initial settings failure can recover on the next scheduled reload', async () => {
  let attempts = 0;
  const controller = createSettingsController({ getSettings: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Mom is offline.');
    return response();
  }, updateSettings: async (patch) => ({ ok: true as const, ...response(patch) }) }, () => undefined);
  await controller.reload();
  assert.equal(controller.getSnapshot().data, null);
  assert.equal(controller.getSnapshot().loading, false);
  assert.equal(controller.getSnapshot().error, 'Mom is offline.');
  await controller.reload();
  assert.equal(attempts, 2);
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().data?.settings.screen_monitoring, true);
});

test('an authoritative refresh converges after another client changes an acknowledged value and capabilities', async () => {
  let authoritative = response();
  const controller = createSettingsController({ getSettings: async () => authoritative, updateSettings: async (patch) => ({ ok: true as const, ...response(patch) }) }, () => undefined);
  await controller.reload();
  await controller.update({ webcam: true });
  controller.sync(defaults);
  assert.equal(controller.getSnapshot().data?.settings.webcam, true);

  authoritative = response({ webcam: false });
  authoritative.available.webcam = false;
  authoritative.unavailable_reason.webcam = 'The camera was disconnected.';
  await controller.reload(true);
  assert.equal(controller.getSnapshot().data?.settings.webcam, false);
  assert.equal(controller.getSnapshot().data?.available.webcam, false);
  assert.equal(controller.getSnapshot().data?.unavailable_reason.webcam, 'The camera was disconnected.');
  controller.sync({ ...defaults, webcam: true });
  assert.equal(controller.getSnapshot().data?.settings.webcam, false);
  controller.sync(defaults);
  assert.equal(controller.getSnapshot().data?.settings.webcam, false);
});

test('background reads do not disable controls and a late read cannot undo a newer write', async () => {
  const oldRead = deferred<SettingsResponse>();
  let reads = 0;
  const controller = createSettingsController({ getSettings: () => ++reads === 1 ? Promise.resolve(response()) : oldRead.promise, updateSettings: async (patch) => ({ ok: true as const, ...response(patch) }) }, () => undefined);
  await controller.reload();
  const background = controller.reload(true);
  assert.equal(controller.getSnapshot().loading, false);
  assert.equal(await controller.update({ detector_llm: 'jev' }), true);
  assert.equal(controller.getSnapshot().data?.settings.detector_llm, 'jev');
  oldRead.resolve(response());
  await background;
  assert.equal(controller.getSnapshot().data?.settings.detector_llm, 'jev');
  assert.equal(controller.getSnapshot().savedKey, 'detector_llm');
});

test('background refresh skips a pending settings write instead of sending a competing request', async () => {
  const write = deferred<SettingsResponse & { ok: true }>();
  let reads = 0;
  const controller = createSettingsController({ getSettings: async () => { reads += 1; return response(); }, updateSettings: () => write.promise }, () => undefined);
  await controller.reload();
  const save = controller.update({ demo_mode: false });
  await controller.reload(true);
  await controller.reload();
  assert.equal(reads, 1);
  assert.equal(controller.getSnapshot().saving, 'demo_mode');
  write.resolve({ ok: true, ...response({ demo_mode: false }) });
  await save;
  assert.equal(controller.getSnapshot().data?.settings.demo_mode, false);
});
