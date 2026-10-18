import type { ApiClient, Event, State, TaskResponse } from "./types";

export type ConnectionState = "connecting" | "connected" | "offline";

export interface DashboardData {
  state: State | null;
  events: Event[];
  connection: ConnectionState;
  loading: boolean;
}

export interface TasksData extends TaskResponse {
  loading: boolean;
  error: string | null;
}

export function createTasksPoller(api: ApiClient, onUpdate: (data: TasksData) => void) {
  let active = true;
  let pending: Promise<void> | null = null;
  let refreshWaiters = 0;
  let latest: TasksData = { tasks: [], sources: {}, loading: true, error: null };

  function run(): Promise<void> {
    if (!active) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await api.getTasks();
        if (!active) return;
        latest = { ...response, loading: false, error: null };
        onUpdate(latest);
      } catch (error) {
        if (!active) return;
        latest = { ...latest, loading: false, error: error instanceof Error ? error.message : "Mom couldn't load your tasks. Please try again." };
        onUpdate(latest);
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  return {
    poll(): Promise<void> { return refreshWaiters ? pending ?? Promise.resolve() : run(); },
    async refresh(): Promise<void> {
      refreshWaiters += 1;
      try {
        if (pending) await pending;
        if (active) await run();
      } finally {
        refreshWaiters -= 1;
      }
    },
    stop() { active = false; },
  };
}

export function createDashboardPoller(api: ApiClient, onUpdate: (data: DashboardData) => void) {
  let active = true;
  let cursor = 0;
  let pending: Promise<void> | null = null;
  let refreshWaiters = 0;
  let latest: DashboardData = { state: null, events: [], connection: "connecting", loading: true };

  function run(): Promise<void> {
    if (!active) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      try {
        const [stateResult, eventsResult] = await Promise.allSettled([api.getState(), api.getEvents(cursor)]);
        if (!active) return;
        if (stateResult.status === "rejected" || eventsResult.status === "rejected") throw new Error("Polling failed.");
        const incoming = eventsResult.value.events;
        const unique = new Map(latest.events.map((event) => [event.id, event]));
        for (const event of incoming) {
          unique.set(event.id, event);
          cursor = Math.max(cursor, event.id);
        }
        latest = {
          state: stateResult.value,
          events: [...unique.values()].sort((a, b) => b.id - a.id),
          connection: "connected",
          loading: false,
        };
        onUpdate(latest);
      } catch {
        if (!active) return;
        latest = { ...latest, connection: "offline", loading: false };
        onUpdate(latest);
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  return {
    poll(): Promise<void> {
      // Commands awaiting a fresh snapshot take priority over the interval.
      return refreshWaiters ? pending ?? Promise.resolve() : run();
    },
    async refresh(): Promise<void> {
      refreshWaiters += 1;
      try {
        // An existing request may have captured data before the command finished.
        if (pending) await pending;
        if (active) await run();
      } finally {
        refreshWaiters -= 1;
      }
    },
    stop() { active = false; },
  };
}
