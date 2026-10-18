import assert from 'node:assert/strict';
import test from 'node:test';
import type { SettingsResponse, State } from '../src/api/types';
import { ageLabel, cameraCanRefresh, cameraStatus, latencyLabel, methodLabel, screenSchedule, screenStatus, urlHost } from '../src/desktop/eyesModel';

const now = Date.parse('2026-10-18T12:00:00Z');
const settings: SettingsResponse = {
  settings: { screen_monitoring: true, screenshots: true, webcam: true, detector_mode: 'lockin', detector_llm: 'gemini', demo_mode: true },
  available: { screen: true, webcam: true },
  unavailable_reason: {},
};

function fixture(): State {
  return {
    now: new Date(now).toISOString(), user_name: 'Jay', demo_mode: true,
    session: { goal: 'Study', started_at: new Date(now - 10000).toISOString(), until: null }, stage: 'watching',
    activity: { app: 'Browser', title: 'Assignment', url: 'https://canvas.example.edu/courses/1?token=hidden' },
    verdict: { focus: 'on_task', distraction: null, reason: 'The assignment is open.' },
    distracted_since: null, ladder: { text_after_secs: 10, call_after_secs: 25, callback_after_secs: 45 },
    call_in_progress: null, callback_at: null, last_promise: null, missed_calls: 0, excuses: [],
    modules: { detector: { status: 'ok' }, webcam: { status: 'ok' }, imessage: { status: 'off' }, calls: { status: 'off' } },
    stats: { focused_secs: 0, distracted_secs: 0, calls_made: 0, texts_sent: 0 },
    settings: settings.settings,
    monitor: {
      screen: { enabled: true, active: true, every_secs: 3, last_check_at: new Date(now - 2000).toISOString(), next_check_at: new Date(now + 1000).toISOString(), method: 'rule', latency_ms: 45 },
      webcam: { enabled: true, active: true, last_check_at: null, verdict: null, latency_ms: null, photo_at: null },
    },
  };
}

test('availability is unknown until GET settings succeeds; it is never inferred from state', () => {
  const state = fixture();
  assert.equal(screenStatus(state, null).mode, 'loading');
  assert.equal(cameraStatus(state, null).mode, 'loading');
  assert.equal(screenStatus(state, null, 'Settings unavailable.').mode, 'settings-error');
  assert.equal(cameraCanRefresh(state, null, true, true), false);
  const unavailable = { ...settings, available: { screen: false, webcam: false }, unavailable_reason: { screen: 'Screen access is unsupported.', webcam: 'No camera connected.' } };
  assert.equal(screenStatus(state, unavailable).detail, 'Screen access is unsupported.');
  assert.equal(cameraStatus(state, unavailable).detail, 'No camera connected.');
  assert.equal(cameraCanRefresh(state, unavailable, true, true), false);
});

test('camera preview runs outside a session, but only while open, visible, enabled, and available', () => {
  const state = fixture();
  state.session = null;
  state.monitor.webcam.active = false;
  assert.equal(cameraStatus(state, settings).title, 'Preview on');
  assert.equal(cameraCanRefresh(state, settings, true, true), true);
  assert.equal(cameraCanRefresh(state, settings, false, true), false);
  assert.equal(cameraCanRefresh(state, settings, true, false), false);
  assert.equal(cameraCanRefresh(state, { ...settings, settings: { ...settings.settings, webcam: false } }, true, true), false);
  state.monitor.webcam.enabled = false;
  assert.equal(cameraCanRefresh(state, settings, true, true), false);
});

test('screen and camera distinguish explicit off, no session, and module errors', () => {
  const state = fixture();
  assert.equal(screenStatus(state, settings).mode, 'ready');
  assert.equal(cameraStatus(state, settings).mode, 'ready');
  state.session = null;
  assert.equal(screenStatus(state, settings).mode, 'waiting-session');
  state.modules.detector = { status: 'error', message: 'Screen recording permission is missing.' };
  state.modules.webcam = { status: 'error', message: 'Camera is busy.' };
  assert.equal(screenStatus(state, settings).detail, 'Screen recording permission is missing.');
  assert.equal(cameraStatus(state, settings).detail, 'Camera is busy.');
  const off = { ...settings, settings: { ...settings.settings, screen_monitoring: false, webcam: false } };
  assert.equal(screenStatus(state, off).title, 'Paused');
  assert.equal(cameraStatus(state, off).title, 'Camera off');
});

test('URL rendering only exposes the hostname, never credentials, paths, fragments, or queries', () => {
  assert.equal(urlHost('https://example.edu/assignments/7?session=private#notes'), 'example.edu');
  assert.equal(urlHost('https://guest:placeholder@example.edu:8443/private'), 'example.edu');
  assert.equal(urlHost('not a URL'), null);
  assert.equal(urlHost('file:///private/local-note'), null);
  assert.equal(urlHost(null), null);
});

test('reported timing separates due checks from finished checks and handles absent or future timestamps', () => {
  const state = fixture();
  assert.deepEqual(screenSchedule(state, now), { due: false, last: '2 s ago', next: 'next in 1 s' });
  assert.deepEqual(screenSchedule(state, now + 2000), { due: true, last: '4 s ago', next: 'next check due' });
  state.monitor.screen.active = false;
  assert.equal(screenSchedule(state, now + 2000).due, false);
  assert.equal(screenSchedule(state, now + 2000).next, 'next check not scheduled');
  assert.equal(ageLabel('invalid', now), null);
  assert.equal(ageLabel(new Date(now + 1000).toISOString(), now), '0 s ago');
  assert.equal(ageLabel(new Date(now - 120000).toISOString(), now), '2 min ago');
  assert.equal(latencyLabel(1534), '1.5 s');
  assert.equal(latencyLabel(45), '45 ms');
  assert.equal(latencyLabel(null), null);
});

test('method badges preserve every API method without pretending an absent method is AI', () => {
  assert.deepEqual(['rule', 'ai', 'screenshot', 'forced', null].map((method) => methodLabel(method as State['monitor']['screen']['method'])), ['Rule', 'AI', 'AI + screenshot', 'Forced', 'Awaiting first check']);
});
