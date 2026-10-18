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

test("v2 client preserves settings subsets and log cursors without adding fields", async () => {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const api = createRealApi(async (url, options) => {
    requests.push({ url: String(url), method: options?.method ?? "GET", body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return Response.json({ ok: true, settings: {}, available: { screen: true, webcam: true }, unavailable_reason: {}, lines: [] });
  });
  await api.getSettings();
  await api.updateSettings({ webcam: false, detector_llm: "jev" });
  await api.getLogs(12.9);
  await api.getLogs(-4);
  assert.deepEqual(requests, [
    { url: "/api/settings", method: "GET", body: undefined },
    { url: "/api/settings", method: "POST", body: { webcam: false, detector_llm: "jev" } },
    { url: "/api/logs?after=12", method: "GET", body: undefined },
    { url: "/api/logs?after=0", method: "GET", body: undefined },
  ]);
});

test("camera photos use cache-busting no-store requests, return blobs, and treat 404 as no photo", async () => {
  let captured: { url: string; options?: RequestInit } | null = null;
  const api = createRealApi(async (url, options) => {
    captured = { url: String(url), options };
    return new Response(new Blob(["sample-image"], { type: "image/jpeg" }), { status: 200 });
  });
  const photo = await api.getWebcamPhoto(123456);
  assert.equal(await photo!.text(), "sample-image");
  assert.equal(photo!.type, "image/jpeg");
  assert.equal(captured!.url, "/api/webcam/photo?t=123456");
  assert.equal(captured!.options?.cache, "no-store");
  assert.equal(captured!.options?.method, "GET");
  assert.ok(captured!.options?.signal instanceof AbortSignal);
  const missing = createRealApi(async () => Response.json({ ok: false, error: "No photo yet." }, { status: 404 }));
  assert.equal(await missing.getWebcamPhoto(4), null);
  const failure = createRealApi(async () => Response.json({ ok: false, error: "Camera permission denied." }, { status: 503 }));
  await assert.rejects(failure.getWebcamPhoto(4), { message: "Camera permission denied." });
});

test("photo cancellation propagates to fetch and remains distinct from a timeout", async () => {
  let requests = 0;
  let fetchSignal: AbortSignal | null | undefined;
  const api = createRealApi(async (_url, options) => {
    requests += 1;
    fetchSignal = options?.signal;
    return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(api.getWebcamPhoto(1, cancelled.signal), { name: "AbortError" });
  assert.equal(requests, 0);
  const controller = new AbortController();
  const pending = api.getWebcamPhoto(2, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fetchSignal?.aborted, true);
  assert.equal(requests, 1);
});

test("camera timeout aborts the request and gives a readable timeout message", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const api = createRealApi(async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  const pending = api.getWebcamPhoto(1);
  const rejected = assert.rejects(pending, /camera took too long/);
  context.mock.timers.tick(8000);
  await rejected;
});
