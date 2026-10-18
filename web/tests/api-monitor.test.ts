import assert from "node:assert/strict";
import test from "node:test";
import { createMockApi } from "../src/api/mock";
import type { MockOptions } from "../src/api/mock";
import type { SettingsPatch } from "../src/api/types";

function setup(options?: MockOptions) {
  let milliseconds = Date.parse("2026-10-18T12:00:00Z");
  return { api: createMockApi(() => milliseconds, options), advance: (seconds: number) => { milliseconds += seconds * 1000; } };
}

test("mock settings validate atomically, return copies, and reject unavailable capabilities", async () => {
  const { api } = setup();
  const initial = await api.getSettings();
  assert.equal(initial.settings.screen_monitoring, true);
  assert.equal(initial.settings.webcam, true);
  const changed = await api.updateSettings({ detector_llm: "jev", detector_mode: "relaxed", screenshots: false });
  assert.equal(changed.ok, true);
  assert.equal(changed.settings.detector_llm, "jev");
  assert.equal(changed.settings.detector_mode, "relaxed");
  await assert.rejects(api.updateSettings({ webcam: false, unknown: true } as SettingsPatch), /Unknown setting/);
  await assert.rejects(api.updateSettings({ webcam: "false" } as unknown as SettingsPatch), /boolean/);
  await assert.rejects(api.updateSettings({ detector_mode: "strict" } as unknown as SettingsPatch), /lockin or relaxed/);
  await assert.rejects(api.updateSettings({ detector_llm: "unknown" } as unknown as SettingsPatch), /gemini or jev/);
  assert.equal((await api.getSettings()).settings.webcam, true);
  changed.settings.webcam = false;
  assert.equal((await api.getState()).settings.webcam, true);
  const limited = setup({ available: { screen: false, webcam: false }, unavailable_reason: { screen: "Screen permission unavailable.", webcam: "No camera device." } }).api;
  const capabilities = await limited.getSettings();
  assert.deepEqual(capabilities.available, { screen: false, webcam: false });
  await assert.rejects(limited.updateSettings({ webcam: true }), /No camera device/);
  await assert.rejects(limited.updateSettings({ screen_monitoring: true }), /Screen permission/);
  assert.equal((await limited.getState()).modules.detector.status, "off");
  assert.equal(await limited.getWebcamPhoto(0), null);
});

test("screen checks tick every three seconds and screenshot/model settings affect diagnostics", async () => {
  const { api, advance } = setup();
  await api.startSession("Write the report");
  let state = await api.getState();
  assert.equal(state.monitor.screen.method, "rule");
  assert.equal(state.monitor.screen.active, true);
  assert.equal(Date.parse(state.monitor.screen.next_check_at!) - Date.parse(state.monitor.screen.last_check_at!), 3000);
  advance(3);
  assert.equal((await api.getState()).monitor.screen.method, "ai");
  advance(3);
  state = await api.getState();
  assert.equal(state.monitor.screen.method, "screenshot");
  assert.equal(state.monitor.webcam.verdict?.focus, "distracted");
  await api.updateSettings({ screenshots: false, detector_llm: "jev" });
  const methods = [];
  for (let index = 0; index < 4; index += 1) {
    advance(3);
    methods.push((await api.getState()).monitor.screen.method);
  }
  assert.ok(!methods.includes("screenshot"));
  const logs = (await api.getLogs(0)).lines;
  assert.ok(logs.some((line) => line.source === "brain" && line.message.includes("jev")));
  assert.ok(logs.some((line) => line.message.includes("Screenshot checked and discarded")));
});

test("screen pause leaves camera judgment active and both paused suppress automatic escalation", async () => {
  const { api, advance } = setup();
  await api.updateSettings({ screen_monitoring: false });
  await api.startSession("Study from a paper book");
  advance(5);
  let state = await api.getState();
  assert.equal(state.activity, null);
  assert.equal(state.monitor.screen.active, false);
  assert.equal(state.monitor.screen.next_check_at, null);
  assert.equal(state.monitor.webcam.active, true);
  assert.equal(state.verdict?.distraction, "Phone in hand");
  advance(25);
  assert.equal((await api.getState()).stage, "calling");
  await api.stopSession();
  await api.updateSettings({ webcam: false });
  await api.startSession("Read quietly");
  const calls = (await api.getState()).stats.calls_made;
  advance(700);
  state = await api.getState();
  assert.equal(state.stage, "watching");
  assert.equal(state.stats.calls_made, calls);
  assert.equal(state.verdict, null);
  assert.equal(state.modules.detector.status, "off");
  assert.equal(state.modules.webcam.status, "off");
  await api.forceDistracted("TikTok", 60);
  advance(25);
  assert.equal((await api.getState()).stage, "calling");
});

test("turning monitors off cancels already scheduled nudges but retains the session", async () => {
  const { api, advance } = setup();
  await api.startSession("Finish homework");
  advance(6);
  assert.equal((await api.getState()).stage, "distracted");
  await api.updateSettings({ screen_monitoring: false, webcam: false });
  advance(100);
  const state = await api.getState();
  assert.equal(state.stage, "watching");
  assert.ok(state.session);
  assert.equal(state.stats.calls_made, 0);
  assert.equal(state.distracted_since, null);
  await api.updateSettings({ screen_monitoring: true });
  advance(5);
  assert.equal((await api.getState()).stage, "distracted");
});

test("demo timing changes reschedule pending escalation, call duration, and callback delay", async () => {
  const { api, advance } = setup();
  await api.startSession("Read the chapter");
  advance(5);
  await api.getState();
  await api.updateSettings({ demo_mode: false });
  let state = await api.getState();
  assert.equal(state.demo_mode, false);
  assert.deepEqual(state.ladder, { text_after_secs: 120, call_after_secs: 300, callback_after_secs: 300 });
  advance(25);
  assert.equal((await api.getState()).stage, "distracted");
  advance(95);
  assert.equal((await api.getState()).stage, "texted");
  advance(180);
  assert.equal((await api.getState()).stage, "calling");
  advance(15);
  assert.equal((await api.getState()).stage, "calling");
  advance(33);
  state = await api.getState();
  assert.equal(state.stage, "waiting_callback");
  assert.equal(Date.parse(state.callback_at!) - Date.parse(state.now), 300_000);
  await api.updateSettings({ demo_mode: true });
  state = await api.getState();
  assert.equal(Date.parse(state.callback_at!) - Date.parse(state.now), 45_000);
  advance(45);
  assert.equal((await api.getState()).call_in_progress?.call_type, "callback");
});

test("camera preview works without a session, expires after ten seconds, and never judges while idle", async () => {
  const { api, advance } = setup();
  assert.equal((await api.getState()).monitor.webcam.photo_at, null);
  const photo = await api.getWebcamPhoto(1);
  assert.equal(photo?.type, "image/svg+xml");
  const markup = await photo!.text();
  assert.match(markup, /GENERATED DEMO/);
  assert.doesNotMatch(markup, /<image\b/);
  let state = await api.getState();
  const firstPhoto = state.monitor.webcam.photo_at;
  assert.equal(state.monitor.webcam.active, false);
  assert.equal(state.monitor.webcam.verdict, null);
  assert.equal(state.monitor.webcam.last_check_at, null);
  advance(3);
  state = await api.getState();
  assert.notEqual(state.monitor.webcam.photo_at, firstPhoto);
  advance(20);
  const expired = (await api.getState()).monitor.webcam.photo_at;
  advance(20);
  assert.equal((await api.getState()).monitor.webcam.photo_at, expired);
  await api.updateSettings({ webcam: false });
  assert.equal(await api.getWebcamPhoto(2), null);
  assert.equal((await api.getState()).monitor.webcam.photo_at, null);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.getWebcamPhoto(3, controller.signal), { name: "AbortError" });
});

test("forced checks use the forced badge and logs preserve event order, source variety, and latest-300 cursors", async () => {
  const { api, advance } = setup();
  await api.startSession("Build the demo");
  await api.forceDistracted("Instagram", 60);
  assert.equal((await api.getState()).monitor.screen.method, "forced");
  advance(25);
  const logs = (await api.getLogs(0)).lines;
  assert.ok(logs.some((line) => line.source === "detect" && line.message === "distracted: Instagram"));
  assert.ok(logs.some((line) => line.source === "text" && line.message === "→ ?"));
  assert.ok(logs.some((line) => line.source === "call" && line.message.includes("nudge call starting")));
  assert.ok(logs.every((line, index) => index === 0 || (line.id > logs[index - 1].id && Date.parse(line.at) >= Date.parse(logs[index - 1].at))));
  assert.equal((await api.getLogs(logs.at(-1)!.id)).lines.length, 0);
  await api.stopSession();
  await api.updateSettings({ demo_mode: false });
  await api.startSession("Long reading session");
  advance(15);
  await api.notDistracted();
  advance(600);
  const retained = (await api.getLogs(0)).lines;
  assert.equal(retained.length, 300);
  assert.ok(retained[0].id > logs[0].id);
  retained[0].message = "mutated";
  assert.notEqual((await api.getLogs(0)).lines[0].message, "mutated");
  assert.equal((await api.getLogs(retained.at(-1)!.id)).lines.length, 0);
});
