import assert from 'node:assert/strict';
import test from 'node:test';
import { initialWindows, windowReducer } from '../src/desktop/windowState';

test('minimize preserves an open window and taskbar restores the same application', () => {
  const tasks = windowReducer(initialWindows, { type: 'open', id: 'tasks' });
  const minimized = windowReducer(tasks, { type: 'minimize', id: 'tasks' });
  assert.equal(minimized.active, null);
  assert.deepEqual(minimized.open, ['today', 'tasks']);
  assert.equal(windowReducer(minimized, { type: 'taskbar', id: 'tasks' }).active, 'tasks');
});

test('switching applications preserves other open windows without duplicate taskbar entries', () => {
  let state = windowReducer(initialWindows, { type: 'open', id: 'settings' });
  state = windowReducer(state, { type: 'open', id: 'today' });
  state = windowReducer(state, { type: 'open', id: 'settings' });
  assert.deepEqual(state.open, ['today', 'settings']);
  assert.equal(state.active, 'settings');
  assert.equal(windowReducer(state, { type: 'minimize', id: 'today' }), state);
});

test('reset restores the usable default layout after all windows are hidden and maximized', () => {
  let state = windowReducer(initialWindows, { type: 'maximize' });
  state = windowReducer(state, { type: 'messenger' });
  state = windowReducer(state, { type: 'taskbar', id: 'today' });
  assert.equal(state.active, null);
  assert.equal(state.messenger, false);
  assert.equal(state.maximized, true);
  assert.deepEqual(windowReducer(state, { type: 'reset' }), initialWindows);
  assert.deepEqual(initialWindows, { open: ['today'], active: 'today', maximized: false, messenger: true });
});
