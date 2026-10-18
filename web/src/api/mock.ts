import type { ApiClient, CallEndedData, CallType, Event, EventKind, GuestCallInput, LogLine, SessionInput, Settings, SettingsPatch, SettingsResponse, State, Task, TranscriptLine } from "./types";

const PROMISE = "open your laptop and find the file";
const EXCUSE = "I don't know how to start";

export const NUDGE_TRANSCRIPT: TranscriptLine[] = [
  { role: "agent", time_in_call_secs: 0, message: "Jay! 5 min on TikTok?! Cousin Kevin would never. What are you stuck on with CSE homework?" },
  { role: "user", time_in_call_secs: 9, message: "I don't know how to start." },
  { role: "agent", time_in_call_secs: 18, message: "Okay okay, don't panic. Just open the assignment PDF and read problem one out loud. Promise?" },
  { role: "user", time_in_call_secs: 25, message: "I don't wanna." },
  { role: "agent", time_in_call_secs: 26, message: "Aiyah, I hear you. Just open the PDF, that's it, you don't even have to read it yet. Promise?" },
  { role: "user", time_in_call_secs: 34, message: "No, I don't." },
  { role: "agent", time_in_call_secs: 35, message: "Okay okay, Mom makes it even smaller. Just open your laptop and find the file. That's all. Promise?" },
  { role: "user", time_in_call_secs: 43, message: "Okay." },
  { role: "agent", time_in_call_secs: 44, message: "Good! Mom calls back in five minutes. Bye bye!" },
];

type ActionKind = "distraction" | "text" | "nudge" | "call_end" | "callback" | "focus" | "deadline";
type Action = { at: number; kind: ActionKind; run: () => void };
type GuestCall = { name: string; goal: string; distraction: string; started_at: string; ends_at: number };

function copy<T>(value: T): T {
  return structuredClone(value);
}

function parseGuest(input: GuestCallInput): Pick<GuestCall, "name" | "goal" | "distraction"> {
  if (!input || input.consent !== true) throw new Error("Tick the box to agree to one call from Mom.exe, an AI.");
  if (typeof input.name !== "string" || !input.name.trim() || Array.from(input.name.trim()).length > 40) throw new Error("Enter a name (up to 40 characters).");
  if (/[{}<>\p{C}\p{Zl}\p{Zp}]/u.test(input.name)) throw new Error("Use letters, numbers and spaces in the name.");
  if (typeof input.phone !== "string" || !input.phone.trim()) throw new Error("Enter a phone number.");
  const digits = input.phone.replace(/\D/g, "");
  const validPhone = input.phone.trim().startsWith("+")
    ? digits.length >= 8 && digits.length <= 15 && digits[0] !== "0"
    : (digits.length === 10 && !"01".includes(digits[0])) || (digits.length === 11 && digits[0] === "1");
  if (!validPhone) throw new Error("Enter a valid US number, or start with + and the country code.");
  function optional(value: unknown, field: string, limit: number, fallback: string) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "string" || Array.from(value.trim()).length > limit || /[\p{C}\p{Zl}\p{Zp}]/u.test(value)) throw new Error(`${field} must be text up to ${limit} characters.`);
    return value.trim() || fallback;
  }
  return { name: input.name.trim(), goal: optional(input.goal, "goal", 120, "your homework"), distraction: optional(input.distraction, "distraction", 40, "TikTok") };
}

function parseSession(input: SessionInput, now: number): { goal: string; until: string | null } {
  if (typeof input !== "string") {
    const goal = input.goal.trim();
    if (goal.length < 2) throw new Error("Tell Mom which task you want to work on.");
    if (input.until !== null && !Number.isFinite(Date.parse(input.until))) throw new Error("Choose a valid session deadline.");
    if (input.until !== null && Date.parse(input.until) <= now) throw new Error("Choose a deadline in the future.");
    return { goal, until: input.until };
  }
  const text = input;
  const cleaned = text.trim();
  if (cleaned.length < 2) throw new Error("Tell Mom what you want to work on, such as CSE homework until 9 PM.");
  const deadline = cleaned.match(/\s+(?:until|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
  if (!deadline) {
    if (/\b(?:until|by)\s*$/i.test(cleaned)) throw new Error("Add a time after until or by, such as 9 PM.");
    return { goal: cleaned, until: null };
  }
  const goal = cleaned.slice(0, deadline.index).trim();
  const rawHour = Number(deadline[1]);
  const minutes = Number(deadline[2] ?? 0);
  const meridiem = deadline[3]?.toLowerCase();
  if (goal.length < 2 || minutes > 59 || rawHour > (meridiem ? 12 : 23) || (meridiem && rawHour < 1)) {
    throw new Error("Mom needs a task and a valid time, such as CSE homework until 9 PM.");
  }
  const hour = meridiem ? rawHour % 12 + (meridiem === "pm" ? 12 : 0) : rawHour;
  const until = new Date(now);
  until.setHours(hour, minutes, 0, 0);
  if (until.getTime() <= now) until.setDate(until.getDate() + 1);
  return { goal, until: until.toISOString() };
}

export interface MockOptions {
  available?: Partial<SettingsResponse["available"]>;
  unavailable_reason?: SettingsResponse["unavailable_reason"];
}

export function createMockApi(now: () => number = Date.now, options: MockOptions = {}): ApiClient {
  let time = now();
  let nextId = 1;
  let nextLogId = 1;
  let actions: Action[] = [];
  let events: Event[] = [];
  let logs: LogLine[] = [];
  let nextMonitorAt = Infinity;
  let previewUntil = 0;
  let forcedUntil = 0;
  let screenChecks = 0;
  let callbackStartedAt: number | null = null;
  let activeCallWithCallback = false;
  let guestCall: GuestCall | null = null;
  let lastGuestCallAt = -Infinity;
  const available = { screen: options.available?.screen ?? true, webcam: options.available?.webcam ?? true };
  const unavailableReason = {
    ...(!available.screen ? { screen: options.unavailable_reason?.screen || "Screen monitoring is not available on this computer." } : {}),
    ...(!available.webcam ? { webcam: options.unavailable_reason?.webcam || "A camera is not available on this computer." } : {}),
  };
  const settings: Settings = { screen_monitoring: available.screen, screenshots: true, webcam: available.webcam, detector_mode: "lockin", detector_llm: "gemini", demo_mode: true };
  const ignoredApps = new Set<string>();
  const due = (days: number, hour: number, minute = 0) => {
    const date = new Date(time);
    date.setDate(date.getDate() + days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const tasks: Task[] = [
    { id: "canvas:assignment:mock-math-concepts", source: "canvas", title: "Week 3 Conceptual Problems", context: "MATH 208", due_at: due(2, 23, 59), url: null, points: 5 },
    { id: "canvas:assignment:mock-info-checkpoint", source: "canvas", title: "Knowledge Checkpoint Quiz", context: "INFO 200", due_at: due(1, 15), url: null, points: 50 },
    { id: "canvas:assignment:mock-psych-writing", source: "canvas", title: "Week 3 Writing Assignment", context: "PSYCH 210", due_at: due(1, 23, 59), url: null, points: 10 },
    { id: "canvas:assignment:mock-info-guide", source: "canvas", title: "Intro + Part I Study Guide", context: "INFO 200", due_at: due(5, 23, 59), url: null, points: 20 },
    { id: "canvas:assignment:mock-math-practice", source: "canvas", title: "Linear Systems Practice", context: "MATH 208", due_at: due(-1, 17), url: null, points: 5 },
    { id: "canvas:assignment:mock-cse-homework", source: "canvas", title: "Programming Assignment: First Steps", context: "CSE 123", due_at: due(0, 23, 59), url: null, points: 25 },
  ];
  const state: State = {
    now: new Date(time).toISOString(),
    user_name: "Jay",
    demo_mode: true,
    session: null,
    stage: "idle",
    activity: null,
    verdict: null,
    distracted_since: null,
    ladder: { text_after_secs: 10, call_after_secs: 25, callback_after_secs: 45 },
    call_in_progress: null,
    callback_at: null,
    last_promise: null,
    missed_calls: 0,
    excuses: [],
    modules: {
      imessage: { status: "ok", message: "Simulated messages" },
      detector: { status: "ok", message: "Scripted screen activity" },
      calls: { status: "ok", message: "Simulated calls; no phone will ring" },
      webcam: { status: available.webcam ? "ok" : "off", message: available.webcam ? "Generated camera preview; no real camera is used" : unavailableReason.webcam },
    },
    stats: { focused_secs: 0, distracted_secs: 0, calls_made: 0, texts_sent: 0 },
    settings,
    monitor: {
      screen: { enabled: available.screen, active: false, every_secs: 3, last_check_at: null, next_check_at: null, method: null, latency_ms: null },
      webcam: { enabled: available.webcam, active: false, last_check_at: null, verdict: null, latency_ms: null, photo_at: null },
    },
  };

  const iso = () => new Date(time).toISOString();

  function log(source: string, message: string) {
    logs.push({ id: nextLogId++, at: iso(), source, message });
    logs = logs.slice(-300);
  }

  function monitoringEnabled() {
    return (settings.screen_monitoring && available.screen) || (settings.webcam && available.webcam);
  }

  function canEscalate() {
    return Boolean(state.session) && (monitoringEnabled() || forcedUntil > time);
  }

  function updateMonitorFlags() {
    const screen = state.monitor.screen;
    const webcam = state.monitor.webcam;
    screen.enabled = settings.screen_monitoring && available.screen;
    screen.active = screen.enabled && Boolean(state.session);
    webcam.enabled = settings.webcam && available.webcam;
    webcam.active = webcam.enabled && Boolean(state.session);
    state.modules.detector = { status: screen.enabled ? "ok" : "off", message: !available.screen ? unavailableReason.screen : screen.enabled ? "Simulated screen monitoring" : "Screen monitoring is paused" };
    state.modules.webcam = { status: webcam.enabled ? "ok" : "off", message: !available.webcam ? unavailableReason.webcam : webcam.enabled ? "Generated camera preview; no real camera is used" : "Camera is off" };
    if (!webcam.active) { webcam.verdict = null; webcam.latency_ms = null; }
    if (!webcam.enabled) { webcam.photo_at = null; webcam.last_check_at = null; }
    const needsTick = screen.active || webcam.active || (webcam.enabled && previewUntil > time);
    if (!needsTick) nextMonitorAt = Infinity;
    else if (!Number.isFinite(nextMonitorAt)) nextMonitorAt = time;
    screen.next_check_at = screen.active ? new Date(nextMonitorAt).toISOString() : null;
  }

  function checkMonitor() {
    updateMonitorFlags();
    const screen = state.monitor.screen;
    const webcam = state.monitor.webcam;
    if (screen.active) {
      const methods = settings.screenshots ? ["rule", "ai", "screenshot"] as const : ["rule", "ai"] as const;
      screen.method = forcedUntil > time ? "forced" : methods[screenChecks++ % methods.length];
      screen.last_check_at = iso();
      screen.latency_ms = screen.method === "rule" ? 12 : screen.method === "forced" ? 0 : settings.detector_llm === "gemini" ? 348 : 216;
      log("detect", `${screen.method} · ${state.verdict?.focus || "unsure"} · ${settings.detector_mode} mode`);
      if (screen.method === "ai" || screen.method === "screenshot") log("brain", `${settings.detector_llm}: ${screen.method === "screenshot" ? "Screenshot checked and discarded." : "Window title checked."}`);
    }
    if (webcam.enabled && (webcam.active || previewUntil > time)) {
      webcam.photo_at = iso();
      if (webcam.active) {
        webcam.last_check_at = iso();
        webcam.latency_ms = 265;
        const distracted = state.verdict?.focus === "distracted";
        webcam.verdict = { focus: distracted ? "distracted" : "on_task", distraction: distracted ? "Phone in hand" : null, reason: distracted ? "The simulated student is looking at a phone." : "The simulated student is looking at the assignment." };
        log("webcam", distracted ? "Phone in hand detected in the simulated frame." : "Focused · simulated frame checked in memory.");
      } else log("webcam", "Preview refreshed in memory. No judgment outside a session.");
    }
    const needsTick = screen.active || webcam.active || (webcam.enabled && previewUntil > time);
    nextMonitorAt = needsTick ? time + 3000 : Infinity;
    screen.next_check_at = screen.active ? new Date(nextMonitorAt).toISOString() : null;
  }

  function emit(kind: EventKind, summary: string, data: Record<string, unknown> = {}) {
    events.push({ id: nextId++, at: iso(), kind, summary, data: copy(data) });
    events = events.slice(-200);
    const source = kind.startsWith("text") ? "text" : kind.startsWith("call") ? "call" : kind === "verdict" ? "detect" : kind === "error" ? "api" : "main";
    const message = kind === "text_out" ? `→ ${summary}` : kind === "text_in" ? `← ${summary}` : kind === "call_started" ? `📞 ${String(data.call_type)} call starting` : kind === "verdict" && data.focus === "distracted" ? `distracted: ${String(data.distraction)}` : summary;
    log(source, message);
  }

  function sendText(text: string) {
    state.stats.texts_sent += 1;
    emit("text_out", text, { text });
  }

  function schedule(kind: ActionKind, delaySeconds: number, run: () => void) {
    actions.push({ at: time + delaySeconds * 1000, kind, run });
    actions.sort((a, b) => a.at - b.at);
  }

  function cancel(...kinds: ActionKind[]) {
    actions = actions.filter((action) => !kinds.includes(action.kind));
  }

  function setFocused(reason: string, preserveApp = false) {
    const changed = state.verdict?.focus !== "on_task";
    if (!settings.screen_monitoring || !available.screen) state.activity = null;
    else if (!preserveApp) state.activity = { app: "Visual Studio Code", title: "assignment.py — CSE homework", url: null };
    state.verdict = monitoringEnabled() ? { focus: "on_task", distraction: null, reason } : null;
    state.distracted_since = null;
    if (!state.call_in_progress && !state.callback_at) state.stage = state.session ? "watching" : "idle";
    if (changed && state.verdict) emit("verdict", "Back on task. Mom approves.", { ...state.verdict, ...state.activity });
  }

  function endSession(reason: "stopped" | "time_up") {
    if (state.session) emit("session_ended", reason === "stopped" ? "Session complete. Good work, Jay." : "Time is up. Your focus session is complete.", { goal: state.session.goal, reason });
    actions = [];
    state.session = null;
    state.stage = "idle";
    state.call_in_progress = null;
    state.callback_at = null;
    state.distracted_since = null;
    state.activity = null;
    state.verdict = null;
    forcedUntil = 0;
    callbackStartedAt = null;
    updateMonitorFlags();
  }

  function finishCall(callType: CallType, withCallback: boolean) {
    state.call_in_progress = null;
    forcedUntil = 0;
    const data: CallEndedData = {
      call_type: callType,
      conversation_id: `mock-conversation-${nextId}`,
      answered: true,
      duration_secs: callType === "callback" ? 10 : 48,
      promised_step: PROMISE,
      excuse: callType === "callback" ? null : EXCUSE,
      summary: callType === "callback" ? "You opened the file. Mom is proud." : "Mom made the first step smaller. You promised to open your laptop and find the file.",
      transcript: callType === "callback" ? [
        { role: "agent", time_in_call_secs: 0, message: "Jay, did you open your laptop and find the file?" },
        { role: "user", time_in_call_secs: 4, message: "Yes, I found it. I'm starting now." },
        { role: "agent", time_in_call_secs: 7, message: "Good. Mom is proud. Now keep going." },
      ] : copy(NUDGE_TRANSCRIPT).map((line) => ({ ...line, message: line.message.replace("CSE homework", state.session?.goal ?? "CSE homework") })),
    };
    emit("call_ended", callType === "callback" ? "Callback answered. Promise kept." : "Call answered. One tiny step agreed.", data);
    state.last_promise = PROMISE;
    if (callType !== "callback" && !state.excuses.includes(EXCUSE)) state.excuses.push(EXCUSE);
    setFocused("The call helped you find your first step.");
    if (callType === "callback") {
      sendText("Good. Mom is proud. Now keep going.");
      endSession("stopped");
    } else if (withCallback && canEscalate()) {
      sendText(`You promised Mom: open your laptop and find the file. I'm calling back in ${settings.demo_mode ? "1 min" : "5 min"}. Don't make me call your cousin.`);
      state.stage = "waiting_callback";
      callbackStartedAt = time;
      state.callback_at = new Date(time + state.ladder.callback_after_secs * 1000).toISOString();
      schedule("callback", state.ladder.callback_after_secs, () => startCall("callback", false));
    } else {
      state.stage = state.session ? "watching" : "idle";
      if (!state.session) { state.activity = null; state.verdict = null; }
    }
  }

  function startCall(callType: CallType, withCallback: boolean) {
    if (guestCall) {
      schedule(callType === "callback" ? "callback" : "nudge", Math.max(0, (guestCall.ends_at - time) / 1000), () => startCall(callType, withCallback));
      return;
    }
    cancel("text", "nudge", "callback");
    state.stage = "calling";
    state.callback_at = null;
    state.call_in_progress = { call_type: callType, started_at: iso() };
    activeCallWithCallback = withCallback;
    state.stats.calls_made += 1;
    emit("call_started", callType === "callback" ? "Mom is calling back to check your promise." : "Mom is calling. Time for a little talk.", {
      call_type: callType,
      opening_line: callType === "callback" ? "Jay, did you open your laptop and find the file?" : NUDGE_TRANSCRIPT[0].message,
    });
    schedule("call_end", callType === "callback" ? 10 : settings.demo_mode ? 15 : 48, () => finishCall(callType, withCallback));
  }

  function planEscalation() {
    cancel("text", "nudge");
    if (!canEscalate() || !state.distracted_since || state.call_in_progress) return;
    const elapsed = (time - Date.parse(state.distracted_since)) / 1000;
    if (state.stage !== "texted") schedule("text", Math.max(0, state.ladder.text_after_secs - elapsed), () => {
      if (!canEscalate() || state.verdict?.focus !== "distracted") return;
      state.stage = "texted";
      // Same wording as brain.py's first check-in text.
      const distraction = state.verdict?.distraction || "that";
      sendText(`${state.user_name}, what are you doing? ${distraction}?? You said ${state.session?.goal ?? "your task"}. Mom is watching 👀`);
    });
    schedule("nudge", Math.max(0, state.ladder.call_after_secs - elapsed), () => {
      if (canEscalate() && state.verdict?.focus === "distracted") startCall("nudge", true);
    });
  }

  function distract(distraction: string) {
    cancel("distraction", "text", "nudge", "focus");
    state.activity = settings.screen_monitoring && available.screen ? { app: distraction, title: `${distraction} — For You`, url: null } : null;
    state.verdict = { focus: "distracted", distraction, reason: forcedUntil > time ? `Demo override: ${distraction}.` : state.activity ? `This looks like ${distraction}, rather than your current task.` : "The simulated camera noticed a phone in your hand." };
    state.distracted_since = iso();
    state.stage = "distracted";
    emit("verdict", `Distracted: ${distraction}. Mom noticed.`, { ...state.verdict, ...state.activity });
    planEscalation();
  }

  function planDistraction() {
    cancel("distraction");
    if (!state.session || !monitoringEnabled() || state.call_in_progress || state.callback_at || forcedUntil > time) return;
    schedule("distraction", settings.demo_mode ? 5 : 15, () => {
      if (!monitoringEnabled() || !state.session) return;
      const distraction = settings.screen_monitoring && available.screen ? "TikTok" : "Phone in hand";
      if (!ignoredApps.has(distraction)) distract(distraction);
    });
  }

  function tickTo(target: number) {
    const seconds = Math.max(0, target - time) / 1000;
    if (state.session && state.verdict?.focus === "on_task") state.stats.focused_secs += seconds;
    if (state.session && state.verdict?.focus === "distracted") state.stats.distracted_secs += seconds;
    time = target;
  }

  function finishGuestCall() {
    if (!guestCall) return;
    const completed = guestCall;
    guestCall = null;
    const data: CallEndedData = {
      call_type: "nudge",
      guest_name: completed.name,
      conversation_id: `mock-guest-${nextId}`,
      answered: true,
      duration_secs: 15,
      promised_step: null,
      excuse: null,
      summary: `Guest call to ${completed.name} about ${completed.goal}.`,
      transcript: [
        { role: "agent", time_in_call_secs: 0, message: `${completed.name}! ${completed.distraction} again? You should be doing ${completed.goal}.` },
        { role: "user", time_in_call_secs: 5, message: `Okay, Mom. I will start ${completed.goal} now.` },
        { role: "agent", time_in_call_secs: 9, message: `Good, ${completed.name}. Just open the assignment and take one small step. Mom believes in you.` },
        { role: "user", time_in_call_secs: 13, message: "I can do that. Bye, Mom." },
      ],
    };
    emit("call_ended", `Guest call to ${completed.name} ended after 0:15`, data);
  }

  function advance() {
    const target = Math.max(time, now());
    while (Math.min(actions[0]?.at ?? Infinity, nextMonitorAt, guestCall?.ends_at ?? Infinity) <= target) {
      if (guestCall && guestCall.ends_at <= Math.min(actions[0]?.at ?? Infinity, nextMonitorAt)) {
        tickTo(guestCall.ends_at);
        finishGuestCall();
      } else if ((actions[0]?.at ?? Infinity) <= nextMonitorAt) {
        const next = actions.shift()!;
        tickTo(next.at);
        next.run();
      } else {
        tickTo(nextMonitorAt);
        checkMonitor();
      }
    }
    tickTo(target);
    state.now = iso();
  }

  function settingsResponse(): SettingsResponse {
    return copy({ settings, available, unavailable_reason: unavailableReason });
  }

  function validateSettings(patch: SettingsPatch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Settings must be an object.");
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.prototype.hasOwnProperty.call(settings, key)) throw new Error(`Unknown setting: ${key}.`);
      if (key === "detector_mode") {
        if (value !== "lockin" && value !== "relaxed") throw new Error("Detector mode must be lockin or relaxed.");
      } else if (key === "detector_llm") {
        if (value !== "gemini" && value !== "jev") throw new Error("AI model must be gemini or jev.");
      } else if (typeof value !== "boolean") throw new Error(`${key} must be a boolean.`);
    }
    if (patch.screen_monitoring && !available.screen) throw new Error(unavailableReason.screen);
    if (patch.webcam && !available.webcam) throw new Error(unavailableReason.webcam);
  }

  function updateTiming() {
    state.demo_mode = settings.demo_mode;
    state.ladder = settings.demo_mode ? { text_after_secs: 10, call_after_secs: 25, callback_after_secs: 45 } : { text_after_secs: 120, call_after_secs: 300, callback_after_secs: 300 };
    if (state.call_in_progress) {
      const call = state.call_in_progress;
      const elapsed = (time - Date.parse(call.started_at)) / 1000;
      const length = call.call_type === "callback" ? 10 : settings.demo_mode ? 15 : 48;
      cancel("call_end");
      schedule("call_end", Math.max(0, length - elapsed), () => finishCall(call.call_type, activeCallWithCallback));
    } else if (state.callback_at && callbackStartedAt !== null) {
      cancel("callback");
      state.callback_at = new Date(Math.max(time, callbackStartedAt + state.ladder.callback_after_secs * 1000)).toISOString();
      schedule("callback", (Date.parse(state.callback_at) - time) / 1000, () => { if (canEscalate()) startCall("callback", false); });
    } else if (state.distracted_since) planEscalation();
    else planDistraction();
  }

  updateMonitorFlags();
  log("main", "Mom.exe mock started. No real messages, calls, camera, or screenshots.");

  return {
    async getState() {
      advance();
      return copy({ ...state, stage: guestCall && state.session ? "calling" as const : state.stage, call_in_progress: guestCall ? { call_type: "nudge" as const, started_at: guestCall.started_at, guest_name: guestCall.name } : state.call_in_progress });
    },
    async getEvents(after) { advance(); return { events: copy(events.filter((event) => event.id > after)) }; },
    async getSettings() { advance(); return settingsResponse(); },
    async updateSettings(patch) {
      advance();
      validateSettings(patch);
      const sourceChanged = (patch.screen_monitoring !== undefined && patch.screen_monitoring !== settings.screen_monitoring) || (patch.webcam !== undefined && patch.webcam !== settings.webcam);
      const timingChanged = patch.demo_mode !== undefined && patch.demo_mode !== settings.demo_mode;
      Object.assign(settings, patch);
      log("api", `Settings updated: ${Object.entries(patch).map(([key, value]) => `${key}=${String(value)}`).join(", ") || "no changes"}.`);
      updateMonitorFlags();
      if (sourceChanged && forcedUntil <= time) {
        cancel("distraction", "text", "nudge", "focus");
        if (!monitoringEnabled()) { cancel("callback"); state.callback_at = null; callbackStartedAt = null; }
        if (state.session) {
          setFocused(monitoringEnabled() ? "Monitoring settings changed. Mom is checking your next small step." : "Screen and camera monitoring are paused.");
          planDistraction();
        }
      }
      if (!settings.screen_monitoring || !available.screen) state.activity = null;
      if (timingChanged) updateTiming();
      checkMonitor();
      return { ok: true as const, ...settingsResponse() };
    },
    async getLogs(after) {
      advance();
      return { lines: copy(logs.filter((line) => line.id > after)) };
    },
    async getWebcamPhoto(_timestamp, signal) {
      if (signal?.aborted) throw new DOMException("Camera request was cancelled.", "AbortError");
      advance();
      if (!settings.webcam || !available.webcam) return null;
      previewUntil = time + 10_000;
      updateMonitorFlags();
      if (!state.monitor.webcam.photo_at) checkMonitor();
      const caption = state.session ? state.monitor.webcam.verdict?.focus === "distracted" ? "PHONE IN HAND" : "FOCUS IN PROGRESS" : "PREVIEW ONLY — NOT JUDGING";
      const phone = state.session && state.monitor.webcam.verdict?.focus === "distracted"
        ? '<g transform="rotate(-12 510 270)"><path d="M475 310l35-28" stroke="#7d9775" stroke-width="22" stroke-linecap="round"/><rect x="489" y="213" width="58" height="98" rx="8" fill="#182a29" stroke="#d9ba74" stroke-width="5"/><rect x="497" y="225" width="42" height="68" rx="3" fill="#7e9ca1"/><circle cx="518" cy="302" r="3" fill="#e5d7a3"/><path d="M490 270v26" stroke="#8aa17c" stroke-width="12" stroke-linecap="round"/></g>' : '';
      const stamp = new Date(state.monitor.webcam.photo_at || time).toISOString().slice(11, 19);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h4" stroke="#b8d7a0" stroke-opacity=".06"/></pattern></defs><rect width="800" height="500" fill="#152720"/><path d="M0 360h800v140H0z" fill="#283e31"/><rect x="60" y="66" width="175" height="180" rx="2" fill="#294435"/><path d="M145 66v180M60 153h175" stroke="#4a6650" stroke-width="7"/><circle cx="420" cy="188" r="59" fill="#7d9775"/><path d="M319 345v-42q0-76 101-76t101 76v42" fill="#54765c"/><path d="M250 309h296l-24 102H278z" fill="#8ca58a"/><path d="M235 411h325" stroke="#bed1a6" stroke-width="12"/>${phone}<path d="M624 344v-73m0 35q-62-44-28-66 35 2 28 66m0 13q69-53 72-16-20 32-72 16" fill="#55774c" stroke="#55774c" stroke-width="8"/><path d="M600 344h56l-10 55h-36z" fill="#a48d64"/><rect width="800" height="500" fill="url(#scan)"/><g fill="#c2d9ae" font-family="monospace"><text x="30" y="40" font-size="20">MOM CAM / GENERATED DEMO</text><text x="650" y="40" font-size="20">${stamp}</text><text x="30" y="466" font-size="20">${caption}</text><text x="30" y="435" font-size="16">NO REAL PHOTO · MEMORY ONLY</text></g><path d="M22 75v-20h20M758 55h20v20M22 425v20h20M758 445h20v-20" fill="none" stroke="#94b17e" stroke-width="3"/></svg>`;
      return new Blob([svg], { type: "image/svg+xml" });
    },
    async getTasks() {
      advance();
      return {
        tasks: copy(tasks),
        sources: {
          canvas: { status: "ok", synced_at: new Date(time - 120_000).toISOString() },
          trello: { status: "off", synced_at: null, message: "Coming soon" },
          calendar: { status: "off", synced_at: null, message: "Coming soon" },
        },
      };
    },
    async startSession(input) {
      advance();
      const parsed = parseSession(input, time);
      if (state.call_in_progress || guestCall) throw new Error("Finish the current call before starting a new session.");
      if (state.session) endSession("stopped");
      actions = [];
      ignoredApps.clear();
      state.last_promise = null;
      state.callback_at = null;
      state.session = { ...parsed, started_at: iso() };
      state.stage = "watching";
      emit("session_started", `Started: ${parsed.goal}`, parsed);
      const deadline = parsed.until ? ` until ${new Date(parsed.until).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "";
      sendText(`OK Jay. ${parsed.goal}${deadline}. Mom is watching. 👀`);
      setFocused("Your editor is open. A good place to start.");
      planDistraction();
      checkMonitor();
      if (parsed.until) schedule("deadline", (Date.parse(parsed.until) - time) / 1000, () => endSession("time_up"));
      return { ok: true, ...parsed };
    },
    async stopSession() { advance(); endSession("stopped"); return { ok: true }; },
    async notDistracted() {
      advance();
      if (!state.session) throw new Error("Start a session before telling Mom you're working.");
      if (state.activity) ignoredApps.add(state.activity.app);
      if (state.verdict?.distraction) ignoredApps.add(state.verdict.distraction);
      forcedUntil = 0;
      cancel("text", "nudge", "focus");
      setFocused("You told Mom this app is part of your work. She will remember for this session.", true);
      emit("text_in", "I'm actually working.", { text: "I'm actually working." });
      sendText("Okay, Mom trusts you. I won't flag this app again this session.");
      return { ok: true };
    },
    async testCall() {
      advance();
      if (state.call_in_progress || guestCall) throw new Error("Mom is already on a call. Try again when it ends.");
      cancel("distraction", "text", "nudge", "focus", "callback");
      startCall("nudge", Boolean(state.session));
      return { ok: true };
    },
    async guestCall(input) {
      advance();
      const parsed = parseGuest(input);
      if (state.call_in_progress || guestCall) throw new Error("Mom is already on the phone. Try again when the call ends.");
      const wait = 60_000 - (time - lastGuestCallAt);
      if (wait > 0) throw new Error(`Mom just called someone. Try again in ${Math.ceil(wait / 1000)} s.`);
      lastGuestCallAt = time;
      guestCall = { ...parsed, started_at: iso(), ends_at: time + 15_000 };
      state.stats.calls_made += 1;
      emit("call_started", `Guest call to ${parsed.name}`, { call_type: "nudge", guest_name: parsed.name, opening_line: `${parsed.name}! ${parsed.distraction} again? You should be doing ${parsed.goal}.` });
      return { ok: true };
    },
    async forceDistracted(distraction, seconds) {
      advance();
      if (!state.session) throw new Error("Start a session before forcing a distraction.");
      if (state.call_in_progress || guestCall) throw new Error("Wait for the current call to finish before forcing a distraction.");
      if (!distraction.trim()) throw new Error("Enter the name of a distracting app.");
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw new Error("Choose a duration between 1 and 3,600 seconds.");
      cancel("callback");
      state.callback_at = null;
      forcedUntil = time + seconds * 1000;
      distract(distraction.trim());
      checkMonitor();
      schedule("focus", seconds, () => {
        cancel("text", "nudge");
        forcedUntil = 0;
        setFocused("The forced distraction has ended. Back to your task.");
      });
      return { ok: true };
    },
  };
}
