import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoFeed, type PhotoFeedSnapshot } from '../src/desktop/photoFeed';
import { photoDownloadAge } from '../src/desktop/eyesModel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise<void>((done) => setImmediate(done));
const imageBlob = () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });

function harness(fetchPhoto: (timestamp: number, signal: AbortSignal) => Promise<Blob | null>, now: () => number = () => 12345) {
  const updates: PhotoFeedSnapshot[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const scheduled = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const feed = createPhotoFeed({
    fetchPhoto,
    now,
    onChange: (snapshot) => updates.push(snapshot),
    createUrl: () => { const url = `blob:photo-${created.length + 1}`; created.push(url); return url; },
    revokeUrl: (url) => revoked.push(url),
    schedule: (callback, delay) => {
      const id = ++timerId;
      scheduled.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (timer) => { scheduled.delete(timer as unknown as number); },
  });
  function runNext() {
    const [id, task] = [...scheduled.entries()][0];
    scheduled.delete(id);
    task.callback();
    return task.delay;
  }
  return { feed, updates, created, revoked, scheduled, runNext };
}

test('camera photo polling starts only when enabled and waits for in-flight requests', async () => {
  const gate = deferred<Blob | null>();
  let requests = 0;
  let cacheTimestamp = 0;
  const h = harness((timestamp) => { requests += 1; cacheTimestamp = timestamp; return gate.promise; });
  await h.feed.poll();
  assert.equal(requests, 0);
  h.feed.setRunning(true);
  await h.feed.poll();
  await h.feed.poll();
  assert.equal(requests, 1);
  assert.equal(cacheTimestamp, 12345);
  assert.equal(h.scheduled.size, 0);
  gate.resolve(imageBlob());
  await flush();
  assert.equal(h.updates.at(-1)?.status, 'ready');
  assert.equal([...h.scheduled.values()][0]?.delay, 3000);
  h.feed.dispose();
});

test('replacing photos releases old object URLs and hiding releases the current photo', async () => {
  let requests = 0;
  const h = harness(async () => { requests += 1; return imageBlob(); });
  h.feed.setRunning(true);
  await flush();
  assert.deepEqual(h.created, ['blob:photo-1']);
  assert.equal(h.runNext(), 3000);
  await flush();
  assert.equal(requests, 2);
  assert.deepEqual(h.revoked, ['blob:photo-1']);
  h.feed.setRunning(false);
  assert.deepEqual(h.revoked, ['blob:photo-1', 'blob:photo-2']);
  assert.deepEqual(h.updates.at(-1), { status: 'idle', url: null, error: null, receivedAt: null });
  assert.equal(h.scheduled.size, 0);
  await h.feed.poll();
  assert.equal(requests, 2);
  h.feed.dispose();
  assert.equal(h.revoked.length, 2);
});

test('disposing a source aborts its request and discards a late photo result', async () => {
  const gate = deferred<Blob | null>();
  let signal: AbortSignal | undefined;
  const h = harness((_timestamp, value) => { signal = value; return gate.promise; });
  h.feed.setRunning(true);
  const count = h.updates.length;
  h.feed.dispose();
  assert.equal(signal?.aborted, true);
  gate.resolve(imageBlob());
  await flush();
  assert.equal(h.updates.length, count);
  assert.equal(h.created.length, 0);
  assert.equal(h.scheduled.size, 0);
});

test('resume never overlaps an unresolved aborted request or accepts its stale result', async () => {
  const gate = deferred<Blob | null>();
  let requests = 0;
  const h = harness(() => { requests += 1; return requests === 1 ? gate.promise : Promise.resolve(imageBlob()); });
  h.feed.setRunning(true);
  h.feed.setRunning(false);
  h.feed.setRunning(true);
  assert.equal(requests, 1);
  gate.resolve(imageBlob());
  await flush();
  assert.equal(h.created.length, 0);
  assert.equal(h.runNext(), 0);
  await flush();
  assert.equal(requests, 2);
  assert.equal(h.created.length, 1);
  h.feed.dispose();
});

test('404 is a waiting state, transport errors retry, and recovery replaces the error', async () => {
  let requests = 0;
  const h = harness(async () => {
    requests += 1;
    if (requests === 1) return null;
    if (requests === 2) throw new Error('Camera connection interrupted.');
    return imageBlob();
  });
  h.feed.setRunning(true);
  await flush();
  assert.deepEqual(h.updates.at(-1), { status: 'waiting', url: null, error: null, receivedAt: null });
  h.runNext();
  await flush();
  assert.equal(h.updates.at(-1)?.status, 'error');
  assert.equal(h.updates.at(-1)?.error, 'Camera connection interrupted.');
  assert.equal([...h.scheduled.values()][0]?.delay, 3000);
  h.runNext();
  await flush();
  assert.equal(h.updates.at(-1)?.status, 'ready');
  assert.equal(h.updates.at(-1)?.error, null);
  h.feed.dispose();
});

test('a missing newer photo clears the old image rather than mislabeling it as current', async () => {
  let requests = 0;
  const h = harness(async () => ++requests === 1 ? imageBlob() : null);
  h.feed.setRunning(true);
  await flush();
  h.runNext();
  await flush();
  assert.equal(h.updates.at(-1)?.status, 'waiting');
  assert.equal(h.updates.at(-1)?.url, null);
  assert.deepEqual(h.revoked, ['blob:photo-1']);
  h.feed.dispose();
});

test('failed refresh retains the displayed photo download time instead of assigning the next capture time', async () => {
  let clock = 1000;
  let requests = 0;
  const h = harness(async () => {
    if (++requests === 1) return imageBlob();
    throw new Error('Photo refresh failed.');
  }, () => clock);
  h.feed.setRunning(true);
  await flush();
  assert.equal(h.updates.at(-1)?.receivedAt, 1000);
  clock = 5000;
  h.runNext();
  await flush();
  const retained = h.updates.at(-1)!;
  assert.equal(retained.status, 'error');
  assert.equal(retained.url, 'blob:photo-1');
  assert.equal(retained.receivedAt, 1000);
  assert.equal(photoDownloadAge(retained, clock), '4 s ago');
  assert.equal(photoDownloadAge(retained, 7000), '6 s ago');
  h.feed.setRunning(false);
  assert.equal(photoDownloadAge(h.updates.at(-1)!, clock), null);
  h.feed.dispose();
});
