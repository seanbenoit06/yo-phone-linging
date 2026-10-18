import assert from 'node:assert/strict';
import test from 'node:test';
import { getCallDetails } from '../src/components/CallTranscript';
import type { Event } from '../src/api/types';

function ended(data: Event['data']): Event {
  return { id: 1, at: new Date(0).toISOString(), kind: 'call_ended', summary: 'Call ended', data };
}

test('guest call history retains the underlying call type while identifying its guest', () => {
  const details = getCallDetails(ended({ call_type: 'nudge', guest_name: 'Alex', answered: true, transcript: [
    { role: 'agent', message: 'Alex, how is MATH 208 going?', time_in_call_secs: 0 },
    { role: 'user', message: 'I am opening my homework.', time_in_call_secs: 4 },
  ] }));
  assert.equal(details.type, 'nudge');
  assert.equal(details.label, 'Guest call to Alex');
  assert.equal(details.guestName, 'Alex');
  assert.equal(details.transcript.length, 2);
  assert.match(details.transcript[0].message, /Alex.*MATH 208/);
});

test('ordinary calls and malformed guest metadata retain existing history labels', () => {
  for (const guest_name of [undefined, null, {}, '   ']) {
    const details = getCallDetails(ended({ call_type: 'callback', guest_name }));
    assert.equal(details.guestName, '');
    assert.equal(details.label, 'Promise check-in');
  }
});
