export interface PhotoFeedSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'waiting' | 'error';
  url: string | null;
  error: string | null;
  receivedAt: number | null;
}

export const emptyPhotoFeed: PhotoFeedSnapshot = { status: 'idle', url: null, error: null, receivedAt: null };

interface PhotoFeedOptions {
  fetchPhoto: (timestamp: number, signal: AbortSignal) => Promise<Blob | null>;
  onChange: (snapshot: PhotoFeedSnapshot) => void;
  now?: () => number;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function createPhotoFeed(options: PhotoFeedOptions) {
  const now = options.now ?? Date.now;
  const createUrl = options.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = options.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let snapshot = { ...emptyPhotoFeed };
  let running = false;
  let disposed = false;
  let generation = 0;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emit(next: PhotoFeedSnapshot) {
    snapshot = next;
    options.onChange({ ...next });
  }

  function clearTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function releasePhoto() {
    if (snapshot.url) revokeUrl(snapshot.url);
    snapshot = { ...snapshot, url: null, receivedAt: null };
  }

  async function poll() {
    if (!running || disposed || request) return;
    clearTimer();
    const version = generation;
    const controller = new AbortController();
    request = controller;
    if (!snapshot.url) emit({ status: 'loading', url: null, error: null, receivedAt: null });
    try {
      const blob = await options.fetchPhoto(now(), controller.signal);
      if (disposed || !running || version !== generation || controller.signal.aborted) return;
      if (!blob) {
        releasePhoto();
        emit({ status: 'waiting', url: null, error: null, receivedAt: null });
      } else {
        const nextUrl = createUrl(blob);
        const previousUrl = snapshot.url;
        emit({ status: 'ready', url: nextUrl, error: null, receivedAt: now() });
        if (previousUrl) revokeUrl(previousUrl);
      }
    } catch (error) {
      if (disposed || !running || version !== generation || controller.signal.aborted) return;
      emit({ ...snapshot, status: 'error', error: error instanceof Error ? error.message : 'The latest camera photo could not be loaded.' });
    } finally {
      request = null;
      if (running && !disposed) {
        timer = schedule(() => { timer = null; void poll(); }, version === generation ? 3000 : 0);
      }
    }
  }

  return {
    poll,
    setRunning(next: boolean) {
      if (disposed || next === running) return;
      running = next;
      generation += 1;
      clearTimer();
      if (next) {
        void poll();
      } else {
        request?.abort();
        releasePhoto();
        emit({ ...emptyPhotoFeed });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      generation += 1;
      clearTimer();
      request?.abort();
      releasePhoto();
    },
  };
}
