import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMockApi } from "./mock";
import { createDashboardPoller, createTasksPoller } from "./poller";
import type { ConnectionState, TasksData } from "./poller";
import type { ApiClient, CommandResult, Event, State, TaskResponse } from "./types";

export type { ConnectionState } from "./poller";

export function createRealApi(fetcher: typeof fetch = (...args) => fetch(...args)): ApiClient {
  async function request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(`/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      const error = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : null;
      if (!response.ok || (data && typeof data === "object" && "ok" in data && data.ok === false)) {
        throw new Error(error || `Mom couldn't complete that request (${response.status}). Please try again.`);
      }
      if (data === null) throw new Error("Mom returned an unreadable response. Please try again.");
      return data as T;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Mom took too long to reply. Please try again.");
      if (error instanceof TypeError) throw new Error("Can't reach Mom. Is python main.py running?");
      throw error instanceof Error ? error : new Error("Can't reach Mom. Please try again.");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getState: () => request<State>("/state"),
    getEvents: (after) => request<{ events: Event[] }>(`/events?after=${Math.max(0, Math.floor(after))}`),
    getTasks: () => request<TaskResponse>("/tasks"),
    startSession: (input) => request<CommandResult>("/session/start", typeof input === "string" ? { text: input } : input),
    stopSession: () => request<CommandResult>("/session/stop", {}),
    notDistracted: () => request<CommandResult>("/not-distracted", {}),
    testCall: () => request<CommandResult>("/test-call", {}),
    forceDistracted: (distraction, seconds) => request<CommandResult>("/demo/force-distracted", { distraction, seconds }),
  };
}

export const realApi = createRealApi();
const mockApi = createMockApi();

interface DashboardSnapshot {
  source: boolean;
  state: State | null;
  events: Event[];
  connection: ConnectionState;
  loading: boolean;
}

function initialSnapshot(source: boolean): DashboardSnapshot {
  return { source, state: null, events: [], connection: "connecting", loading: true };
}

export function useDashboard(mock: boolean) {
  const api = useMemo(() => mock ? mockApi : realApi, [mock]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(() => initialSnapshot(mock));
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    setSnapshot(initialSnapshot(mock));
    const poller = createDashboardPoller(api, (data) => setSnapshot({ source: mock, ...data }));
    refreshRef.current = poller.refresh;
    void poller.poll();
    const interval = setInterval(() => { void poller.poll(); }, 1000);
    return () => {
      poller.stop();
      clearInterval(interval);
    };
  }, [api, mock]);

  const current = snapshot.source === mock ? snapshot : initialSnapshot(mock);
  return { state: current.state, events: current.events, connection: current.connection, loading: current.loading, refresh, api };
}

function initialTasks(source: boolean): TasksData & { source: boolean } {
  return { source, tasks: [], sources: {}, loading: true, error: null };
}

export function useTasks(mock: boolean) {
  const api = useMemo(() => mock ? mockApi : realApi, [mock]);
  const [snapshot, setSnapshot] = useState(() => initialTasks(mock));
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    setSnapshot(initialTasks(mock));
    const poller = createTasksPoller(api, (data) => setSnapshot({ source: mock, ...data }));
    refreshRef.current = poller.refresh;
    void poller.poll();
    const interval = setInterval(() => { void poller.poll(); }, 60_000);
    return () => {
      poller.stop();
      clearInterval(interval);
    };
  }, [api, mock]);

  const current = snapshot.source === mock ? snapshot : initialTasks(mock);
  return { tasks: current.tasks, sources: current.sources, loading: current.loading, error: current.error, refresh };
}
