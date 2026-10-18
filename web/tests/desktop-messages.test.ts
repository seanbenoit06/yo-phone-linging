import assert from 'node:assert/strict';
import test from 'node:test';
import type { Event } from '../src/api/types';
import { recentMessages } from '../src/desktop/selectors';

test('Messenger shows the newest six messages chronologically, excluding unrelated events', () => {
  const events: Event[] = Array.from({ length: 12 }, (_, index) => ({ id: 12 - index, at: '2026-10-17T12:00:00Z', kind: index === 0 ? 'verdict' : index % 2 ? 'text_in' : 'text_out', summary: `Event ${12 - index}`, data: {} }));
  const original = events.map((event) => event.id);
  assert.deepEqual(recentMessages(events).map((event) => event.id), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(events.map((event) => event.id), original);
  assert.deepEqual(recentMessages([]), []);
});
