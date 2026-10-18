import assert from "node:assert/strict";
import test from "node:test";
import { createMockApi } from "../src/api/mock";
import { createDashboardPoller, createTasksPoller } from "../src/api/poller";
import type { DashboardData, TasksData } from "../src/api/poller";
import type { ApiClient, Event, State, TaskResponse } from "../src/api/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("command refresh waits for the in-flight request then fetches fresh state without overlap", async () => {
  const mock = createMockApi();
  const stale = await mock.getState();
  const gate = deferred<State>();
  let requests = 0;
  let currentRequests = 0;
  let maxRequests = 0;
  const updates: DashboardData[] = [];
  const api: ApiClient = {
    ...mock,
    async getState() {
      requests += 1;
      currentRequests += 1;
      maxRequests = Math.max(maxRequests, currentRequests);
      const result = requests === 1 ? await gate.promise : await mock.getState();
      currentRequests -= 1;
      return result;
    },
  };
  const poller = createDashboardPoller(api, (data) => updates.push(data));
  const pending = poller.poll();
  await mock.startSession("Finish the dashboard");
  const fresh = poller.refresh();
  void poller.poll();
  assert.equal(requests, 1);
  gate.resolve(stale);
  await Promise.all([pending, fresh]);
  assert.equal(requests, 2);
  assert.equal(maxRequests, 1);
  assert.equal(updates.at(-1)?.state?.session?.goal, "Finish the dashboard");
});

test("stopping a source cancels queued refresh and ignores stale data", async () => {
  const mock = createMockApi();
  const gate = deferred<State>();
  let requests = 0;
  const updates: DashboardData[] = [];
  const api: ApiClient = { ...mock, getState: () => { requests += 1; return gate.promise; } };
  const poller = createDashboardPoller(api, (data) => updates.push(data));
  const pending = poller.poll();
  const queued = poller.refresh();
  poller.stop();
  gate.resolve(await mock.getState());
  await Promise.all([pending, queued]);
  await poller.poll();
  assert.equal(requests, 1);
  assert.equal(updates.length, 0);
});

test("history keeps previously seen calls beyond 200 events and advances the cursor", async () => {
  const mock = createMockApi();
  const cursors: number[] = [];
  const updates: DashboardData[] = [];
  const events: Event[] = Array.from({ length: 240 }, (_, index) => ({
    id: index + 1,
    at: "2026-10-17T12:00:00Z",
    kind: index === 0 ? "call_ended" : "text_out",
    summary: `Event ${index + 1}`,
    data: {},
  }));
  const api: ApiClient = {
    ...mock,
    async getEvents(after) {
      cursors.push(after);
      return { events: events.filter((event) => event.id > after).slice(0, 120) };
    },
  };
  const poller = createDashboardPoller(api, (data) => updates.push(data));
  await poller.poll();
  await poller.poll();
  await poller.poll();
  assert.deepEqual(cursors, [0, 120, 240]);
  assert.equal(updates.at(-1)?.events.length, 240);
  assert.equal(updates.at(-1)?.events.at(-1)?.kind, "call_ended");
});

test("a failed cycle keeps data and waits for both requests before allowing recovery", async () => {
  const mock = createMockApi();
  let offline = false;
  const gate = deferred<{ events: Event[] }>();
  const updates: DashboardData[] = [];
  let requests = 0;
  const api: ApiClient = {
    ...mock,
    async getState() {
      requests += 1;
      if (offline) throw new Error("Disconnected");
      return mock.getState();
    },
    getEvents: (after) => offline ? gate.promise : mock.getEvents(after),
  };
  const poller = createDashboardPoller(api, (data) => updates.push(data));
  await mock.startSession("Write the report");
  await poller.poll();
  const previous = updates.at(-1)!;
  offline = true;
  const failure = poller.poll();
  void poller.poll();
  assert.equal(requests, 2);
  gate.resolve({ events: [] });
  await failure;
  assert.equal(updates.at(-1)?.connection, "offline");
  assert.equal(updates.at(-1)?.state, previous.state);
  assert.equal(updates.at(-1)?.events, previous.events);
  offline = false;
  await poller.poll();
  assert.equal(updates.at(-1)?.connection, "connected");
});

test("task polling avoids overlap, keeps tasks during failure, and recovers", async () => {
  const mock = createMockApi();
  const gate = deferred<TaskResponse>();
  let requests = 0;
  let offline = false;
  const updates: TasksData[] = [];
  const api: ApiClient = {
    ...mock,
    async getTasks() {
      requests += 1;
      if (offline) throw new Error("Task source is unavailable.");
      return requests === 1 ? gate.promise : mock.getTasks();
    },
  };
  const poller = createTasksPoller(api, (data) => updates.push(data));
  const pending = poller.poll();
  const fresh = poller.refresh();
  void poller.poll();
  assert.equal(requests, 1);
  gate.resolve(await mock.getTasks());
  await Promise.all([pending, fresh]);
  assert.equal(requests, 2);
  const previous = updates.at(-1)!;
  offline = true;
  await poller.poll();
  assert.equal(updates.at(-1)?.error, "Task source is unavailable.");
  assert.equal(updates.at(-1)?.tasks, previous.tasks);
  offline = false;
  await poller.poll();
  assert.equal(updates.at(-1)?.error, null);
});

test("source switching discards task results and queued refresh from the old source", async () => {
  const mock = createMockApi();
  const gate = deferred<TaskResponse>();
  let requests = 0;
  const updates: TasksData[] = [];
  const api: ApiClient = { ...mock, getTasks: () => { requests += 1; return gate.promise; } };
  const poller = createTasksPoller(api, (data) => updates.push(data));
  const pending = poller.poll();
  const queued = poller.refresh();
  poller.stop();
  gate.resolve(await mock.getTasks());
  await Promise.all([pending, queued]);
  assert.equal(requests, 1);
  assert.equal(updates.length, 0);
});
