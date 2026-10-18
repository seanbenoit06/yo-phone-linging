import assert from "node:assert/strict";
import test from "node:test";
import { createRealApi } from "../src/api/client";

test("real client sends the exact API paths, methods, and command bodies", async () => {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const api = createRealApi(async (url, options) => {
    requests.push({ url: String(url), method: options?.method ?? "GET", body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 });
  });
  await api.getState();
  await api.getEvents(17);
  await api.getTasks();
  await api.startSession("CSE homework until 9 PM");
  await api.startSession({ goal: "MATH 208 Week 3 Conceptual Problems", until: "2026-10-18T20:00:00Z" });
  await api.stopSession();
  await api.notDistracted();
  await api.testCall();
  await api.forceDistracted("TikTok", 60);
  assert.deepEqual(requests, [
    { url: "/api/state", method: "GET", body: undefined },
    { url: "/api/events?after=17", method: "GET", body: undefined },
    { url: "/api/tasks", method: "GET", body: undefined },
    { url: "/api/session/start", method: "POST", body: { text: "CSE homework until 9 PM" } },
    { url: "/api/session/start", method: "POST", body: { goal: "MATH 208 Week 3 Conceptual Problems", until: "2026-10-18T20:00:00Z" } },
    { url: "/api/session/stop", method: "POST", body: {} },
    { url: "/api/not-distracted", method: "POST", body: {} },
    { url: "/api/test-call", method: "POST", body: {} },
    { url: "/api/demo/force-distracted", method: "POST", body: { distraction: "TikTok", seconds: 60 } },
  ]);
});

test("real API preserves readable command errors and explains network failure", async () => {
  const rejected = createRealApi(async () => new Response(JSON.stringify({ ok: false, error: "Please include a task." }), { status: 400 }));
  await assert.rejects(rejected.startSession(""), { message: "Please include a task." });
  const offline = createRealApi(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(offline.getState(), /Can't reach Mom/);
  const invalid = createRealApi(async () => new Response("not JSON", { status: 200 }));
  await assert.rejects(invalid.getState(), /unreadable response/);
  const unavailable = createRealApi(async () => new Response("Bad gateway", { status: 502 }));
  await assert.rejects(unavailable.getState(), /502/);
});
