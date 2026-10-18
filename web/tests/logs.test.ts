import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogsPoller, type LogSnapshot } from '../src/api/logs';
import type { LogLine } from '../src/api/types';

const line = (id: number): LogLine => ({ id, at: '2026-10-17T12:00:00Z', source: 'detect', message: `Check ${id}` });

test('log polling sorts, deduplicates, caps memory, and keeps cursor across clear', async () => {
  const cursors: number[] = [];
  const batches = [[line(3), line(1), line(2), line(2)], [line(4)], [line(5)]];
  let snapshot: LogSnapshot | null = null;
  const poller = createLogsPoller({ async getLogs(after) { cursors.push(after); return { lines: batches.shift()! }; } }, (value) => { snapshot = value; }, 2);
  await poller.poll();
  assert.deepEqual(snapshot!.lines.map((item) => item.id), [2, 3]);
  assert.equal(snapshot!.trimmed, true);
  poller.clear();
  assert.equal(snapshot!.lines.length, 0);
  await poller.poll();
  assert.deepEqual(snapshot!.lines.map((item) => item.id), [4]);
  await poller.poll();
  assert.deepEqual(cursors, [0, 3, 4]);
});

test('clear during an in-flight request discards old lines without replay or overlapping requests', async () => {
  let resolve!: (value: { lines: LogLine[] }) => void;
  let calls = 0;
  const cursors: number[] = [];
  let snapshot: LogSnapshot | null = null;
  const poller = createLogsPoller({ getLogs(after) { calls++; cursors.push(after); return new Promise((done) => { resolve = done; }); } }, (value) => { snapshot = value; });
  const first = poller.poll();
  const duplicate = poller.poll();
  assert.equal(calls, 1);
  poller.clear();
  resolve({ lines: [line(1), line(2)] });
  await Promise.all([first, duplicate]);
  assert.equal(snapshot!.lines.length, 0);
  const next = poller.poll();
  resolve({ lines: [line(3)] });
  await next;
  assert.deepEqual(cursors, [0, 2]);
  assert.deepEqual(snapshot!.lines.map((item) => item.id), [3]);
});

test('log errors retain data and a discarded source cannot publish late results', async () => {
  let fail = false;
  let snapshot: LogSnapshot | null = null;
  const poller = createLogsPoller({ async getLogs() { if (fail) throw new Error('Offline'); return { lines: [line(1)] }; } }, (value) => { snapshot = value; });
  await poller.poll(); fail = true; await poller.poll();
  assert.equal(snapshot!.error, 'Offline');
  assert.deepEqual(snapshot!.lines.map((item) => item.id), [1]);
  fail = false; await poller.poll(); assert.equal(snapshot!.error, null);
  let resolve!: (value: { lines: LogLine[] }) => void;
  let publications = 0;
  const old = createLogsPoller({ getLogs: () => new Promise((done) => { resolve = done; }) }, () => { publications++; });
  const request = old.poll(); old.stop(); resolve({ lines: [line(9)] }); await request;
  assert.equal(publications, 0);
});
