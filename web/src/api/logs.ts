import { useEffect, useRef, useState } from 'react';
import type { ApiClient, LogLine } from './types';

export interface LogSnapshot {
  lines: LogLine[];
  loading: boolean;
  error: string | null;
  trimmed: boolean;
}

const empty = (): LogSnapshot => ({ lines: [], loading: true, error: null, trimmed: false });

export function createLogsPoller(api: Pick<ApiClient, 'getLogs'>, publish: (snapshot: LogSnapshot) => void, limit = 1000) {
  let live = true;
  let cursor = 0;
  let clearVersion = 0;
  let pending: Promise<void> | null = null;
  let snapshot = empty();
  return {
    poll(): Promise<void> {
      if (!live) return Promise.resolve();
      if (pending) return pending;
      const version = clearVersion;
      pending = (async () => {
        try {
          const { lines } = await api.getLogs(cursor);
          if (!live) return;
          const incoming = lines.filter((line) => Number.isSafeInteger(line.id) && line.id > cursor);
          cursor = Math.max(cursor, ...incoming.map((line) => line.id));
          // Clear discards the request already in flight without replaying it next time.
          const merged = new Map(snapshot.lines.map((line) => [line.id, line]));
          if (version === clearVersion) for (const line of incoming) merged.set(line.id, line);
          const ordered = [...merged.values()].sort((a, b) => a.id - b.id);
          snapshot = { lines: ordered.slice(-limit), loading: false, error: null, trimmed: snapshot.trimmed || ordered.length > limit };
        } catch (error) {
          if (!live) return;
          snapshot = { ...snapshot, loading: false, error: error instanceof Error ? error.message : 'Mom could not load the log. Retrying automatically.' };
        } finally {
          pending = null;
        }
        if (live) publish(snapshot);
      })();
      return pending;
    },
    clear() {
      clearVersion += 1;
      snapshot = { ...snapshot, lines: [], trimmed: false };
      if (live) publish(snapshot);
    },
    stop() { live = false; },
  };
}

export function useLogs(api: ApiClient) {
  const [snapshot, setSnapshot] = useState<LogSnapshot & { api: ApiClient }>(() => ({ ...empty(), api }));
  const pollerRef = useRef<ReturnType<typeof createLogsPoller> | null>(null);
  useEffect(() => {
    setSnapshot({ ...empty(), api });
    const poller = createLogsPoller(api, (data) => setSnapshot({ ...data, api }));
    pollerRef.current = poller;
    void poller.poll();
    const timer = setInterval(() => { void poller.poll(); }, 1000);
    return () => { clearInterval(timer); poller.stop(); pollerRef.current = null; };
  }, [api]);
  return { ...(snapshot.api === api ? snapshot : empty()), clear: () => pollerRef.current?.clear() };
}
