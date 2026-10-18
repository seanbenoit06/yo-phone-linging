import assert from "node:assert/strict";
import test from "node:test";
import { createMockApi, NUDGE_TRANSCRIPT } from "../src/api/mock";

function setup() {
  let milliseconds = new Date(2026, 9, 17, 12, 0, 0).getTime();
  return {
    api: createMockApi(() => milliseconds),
    advance: (seconds: number) => { milliseconds += seconds * 1000; },
  };
}

test("the complete demo follows thresholds, preserves the real transcript, and finishes", async () => {
  const { api, advance } = setup();
  assert.equal((await api.getState()).stage, "idle");
  assert.deepEqual((await api.getEvents(0)).events, []);
  const started = await api.startSession("CSE homework until 9 PM");
  assert.equal(started.goal, "CSE homework");
  assert.equal(new Date(started.until!).getHours(), 21);
  assert.equal((await api.getState()).stage, "watching");
  advance(5);
  let state = await api.getState();
  assert.equal(state.stage, "distracted");
  assert.equal(state.verdict?.distraction, "TikTok");
  assert.equal(state.stats.focused_secs, 5);
  advance(9);
  assert.equal((await api.getState()).stage, "distracted");
  advance(1);
  assert.equal((await api.getState()).stage, "texted");
  advance(15);
  state = await api.getState();
  assert.equal(state.stage, "calling");
  assert.equal(state.call_in_progress?.call_type, "nudge");
  advance(15);
  state = await api.getState();
  assert.equal(state.stage, "waiting_callback");
  assert.equal(Date.parse(state.callback_at!) - Date.parse(state.now), 45_000);
  assert.equal(state.last_promise, "open your laptop and find the file");
  assert.deepEqual(state.excuses, ["I don't know how to start"]);
  const nudge = (await api.getEvents(0)).events.find((event) => event.kind === "call_ended");
  assert.equal(nudge?.data.answered, true);
  assert.equal(nudge?.data.duration_secs, 48);
  assert.deepEqual(nudge?.data.transcript, NUDGE_TRANSCRIPT);
  advance(44);
  assert.equal((await api.getState()).stage, "waiting_callback");
  advance(1);
  state = await api.getState();
  assert.equal(state.stage, "calling");
  assert.equal(state.call_in_progress?.call_type, "callback");
  advance(10);
  state = await api.getState();
  assert.equal(state.stage, "idle");
  assert.equal(state.session, null);
  assert.deepEqual(state.stats, { focused_secs: 60, distracted_secs: 40, calls_made: 2, texts_sent: 4 });
  const events = (await api.getEvents(0)).events;
  assert.deepEqual(events.filter((event) => event.kind === "text_out").map((event) => event.data.text), [
    "OK Jay. CSE homework until 9:00 PM. Mom is watching. 👀",
    "?",
    "You promised Mom: open your laptop and find the file. I'm calling back in 1 min. Don't make me call your cousin.",
    "Good. Mom is proud. Now keep going.",
  ]);
  assert.equal(events.at(-1)?.kind, "session_ended");
  assert.ok(events.every((event, index) => index === 0 || event.id > events[index - 1].id));
  assert.equal((await api.getEvents(events.at(-1)!.id)).events.length, 0);
});

test("a tab resumed after the whole demo catches up without losing transitions", async () => {
  const { api, advance } = setup();
  await api.startSession("Write a short essay");
  advance(150);
  const state = await api.getState();
  const events = (await api.getEvents(0)).events;
  assert.equal(state.stage, "idle");
  assert.equal(state.stats.calls_made, 2);
  assert.equal(events.filter((event) => event.kind === "call_ended").length, 2);
  assert.equal(state.stats.focused_secs + state.stats.distracted_secs, 100);
});

test("working correction cancels escalation and keeps the app accepted this session", async () => {
  const { api, advance } = setup();
  await api.startSession("CSE homework");
  advance(5);
  await api.notDistracted();
  advance(120);
  const state = await api.getState();
  assert.equal(state.stage, "watching");
  assert.equal(state.activity?.app, "TikTok");
  assert.equal(state.verdict?.focus, "on_task");
  assert.equal(state.distracted_since, null);
  assert.equal(state.stats.calls_made, 0);
  await api.stopSession();
  await api.startSession("A new session");
  advance(5);
  assert.equal((await api.getState()).stage, "distracted");
});

test("stopping prevents future events and returned data cannot mutate the mock", async () => {
  const { api, advance } = setup();
  await api.startSession("Finish the essay by 11 PM");
  const copy = await api.getState();
  copy.stats.calls_made = 100;
  copy.session!.goal = "mutated";
  const history = await api.getEvents(0);
  history.events[0].data.goal = "mutated";
  assert.equal((await api.getState()).stats.calls_made, 0);
  assert.equal((await api.getState()).session?.goal, "Finish the essay");
  assert.equal((await api.getEvents(0)).events[0].data.goal, "Finish the essay");
  await api.stopSession();
  const count = (await api.getEvents(0)).events.length;
  advance(200);
  assert.equal((await api.getEvents(0)).events.length, count);
  assert.equal((await api.getState()).stage, "idle");
});

test("forced distractions expire, validate inputs, and can trigger the ladder", async () => {
  const { api, advance } = setup();
  await assert.rejects(api.forceDistracted("TikTok", 60), /Start a session/);
  await api.startSession("Build the demo");
  await assert.rejects(api.forceDistracted("", 60), /name/);
  await assert.rejects(api.forceDistracted("TikTok", -1), /duration/);
  await api.forceDistracted("Instagram", 6);
  advance(6);
  assert.equal((await api.getState()).stage, "watching");
  assert.equal((await api.getState()).stats.calls_made, 0);
  await api.forceDistracted("TikTok", 60);
  advance(25);
  assert.equal((await api.getState()).stage, "calling");
  await assert.rejects(api.testCall(), /already on a call/);
});

test("mock test calls are usable while idle and do not create a session", async () => {
  const { api, advance } = setup();
  await api.testCall();
  assert.equal((await api.getState()).stage, "calling");
  advance(15);
  const state = await api.getState();
  assert.equal(state.stage, "idle");
  assert.equal(state.session, null);
  assert.equal(state.stats.calls_made, 1);
  advance(100);
  assert.equal((await api.getState()).stats.calls_made, 1);
});

test("invalid session text leaves the current state unchanged", async () => {
  const { api } = setup();
  await assert.rejects(api.startSession("  "), /Tell Mom/);
  await assert.rejects(api.startSession("Homework until 25 PM"), /valid time/);
  await assert.rejects(api.startSession("Homework until"), /Add a time/);
  assert.equal((await api.getState()).session, null);
  assert.equal((await api.getEvents(0)).events.length, 0);
});

test("session deadlines stop the script and preserve the time_up reason", async () => {
  const { api, advance } = setup();
  await api.startSession("A tiny task until 12:01 PM");
  advance(60);
  const state = await api.getState();
  assert.equal(state.stage, "idle");
  assert.equal(state.callback_at, null);
  const last = (await api.getEvents(0)).events.at(-1)!;
  assert.equal(last.kind, "session_ended");
  assert.equal(last.data.reason, "time_up");
});

test("mock tasks provide sample course context, relative deadlines, and source status", async () => {
  const { api, advance } = setup();
  const response = await api.getTasks();
  const now = Date.parse((await api.getState()).now);
  assert.equal(response.tasks.length, 6);
  assert.ok(response.tasks.every((task) => task.source === "canvas" && task.url === null));
  assert.ok(response.tasks.some((task) => Date.parse(task.due_at!) < now));
  assert.ok(response.tasks.some((task) => task.context === "CSE 123"));
  const math = response.tasks.find((task) => task.title === "Week 3 Conceptual Problems")!;
  assert.equal(math.context, "MATH 208");
  assert.equal(math.points, 5);
  assert.equal(new Date(math.due_at!).getDate(), 19);
  const checkpoint = response.tasks.find((task) => task.title === "Knowledge Checkpoint Quiz")!;
  assert.equal(new Date(checkpoint.due_at!).getHours(), 15);
  assert.equal(new Date(checkpoint.due_at!).getDate(), 18);
  assert.equal(response.sources.canvas.status, "ok");
  assert.equal(now - Date.parse(response.sources.canvas.synced_at!), 120_000);
  assert.equal(response.sources.trello.status, "off");
  assert.equal(response.sources.calendar.status, "off");
  response.tasks[0].title = "changed";
  advance(60);
  const refreshed = await api.getTasks();
  assert.equal(refreshed.tasks[0].title, "Week 3 Conceptual Problems");
  assert.equal(refreshed.tasks[0].due_at, math.due_at);
});

test("structured task starts preserve goal and deadline and end at that deadline", async () => {
  const { api, advance } = setup();
  const now = Date.parse((await api.getState()).now);
  const input = { goal: "MATH 208 Week 3 Conceptual Problems", until: new Date(now + 20_000).toISOString() };
  const result = await api.startSession(input);
  assert.deepEqual(result, { ok: true, ...input });
  assert.equal((await api.getState()).session?.goal, input.goal);
  assert.equal((await api.getState()).session?.until, input.until);
  advance(20);
  assert.equal((await api.getState()).stage, "idle");
  assert.equal((await api.getEvents(0)).events.at(-1)?.data.reason, "time_up");
  await assert.rejects(api.startSession({ goal: input.goal, until: "invalid" }), /valid session deadline/);
  await assert.rejects(api.startSession({ goal: input.goal, until: new Date(now).toISOString() }), /future/);
  await api.startSession({ goal: "Work without a deadline", until: null });
  assert.equal((await api.getState()).session?.until, null);
});
