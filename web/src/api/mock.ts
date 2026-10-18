import type { ApiClient, CallEndedData, CallType, Event, EventKind, SessionInput, State, Task, TranscriptLine } from "./types";

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

function copy<T>(value: T): T {
  return structuredClone(value);
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

export function createMockApi(now: () => number = Date.now): ApiClient {
  let time = now();
  let nextId = 1;
  let actions: Action[] = [];
  let events: Event[] = [];
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
      webcam: { status: "off", message: "Webcam is off in mock mode" },
    },
    stats: { focused_secs: 0, distracted_secs: 0, calls_made: 0, texts_sent: 0 },
  };

  const iso = () => new Date(time).toISOString();

  function emit(kind: EventKind, summary: string, data: Record<string, unknown> = {}) {
    events.push({ id: nextId++, at: iso(), kind, summary, data: copy(data) });
    events = events.slice(-200);
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
    if (!preserveApp) state.activity = { app: "Visual Studio Code", title: "assignment.py — CSE homework", url: null };
    state.verdict = { focus: "on_task", distraction: null, reason };
    state.distracted_since = null;
    if (!state.call_in_progress && !state.callback_at) state.stage = state.session ? "watching" : "idle";
    if (changed) emit("verdict", "Back on task. Mom approves.", { ...state.verdict, ...state.activity });
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
  }

  function finishCall(callType: CallType, withCallback: boolean) {
    state.call_in_progress = null;
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
      ] : copy(NUDGE_TRANSCRIPT),
    };
    emit("call_ended", callType === "callback" ? "Callback answered. Promise kept." : "Call answered. One tiny step agreed.", data);
    state.last_promise = PROMISE;
    if (callType !== "callback" && !state.excuses.includes(EXCUSE)) state.excuses.push(EXCUSE);
    setFocused("The call helped you find your first step.");
    if (callType === "callback") {
      sendText("Good. Mom is proud. Now keep going.");
      endSession("stopped");
    } else if (withCallback && state.session) {
      sendText("You promised Mom: open your laptop and find the file. I'm calling back in 1 min. Don't make me call your cousin.");
      state.stage = "waiting_callback";
      state.callback_at = new Date(time + state.ladder.callback_after_secs * 1000).toISOString();
      schedule("callback", state.ladder.callback_after_secs, () => startCall("callback", false));
    } else {
      state.stage = state.session ? "watching" : "idle";
      if (!state.session) { state.activity = null; state.verdict = null; }
    }
  }

  function startCall(callType: CallType, withCallback: boolean) {
    cancel("text", "nudge", "callback");
    state.stage = "calling";
    state.callback_at = null;
    state.call_in_progress = { call_type: callType, started_at: iso() };
    state.stats.calls_made += 1;
    emit("call_started", callType === "callback" ? "Mom is calling back to check your promise." : "Mom is calling. Time for a little talk.", {
      call_type: callType,
      opening_line: callType === "callback" ? "Jay, did you open your laptop and find the file?" : NUDGE_TRANSCRIPT[0].message,
    });
    schedule("call_end", callType === "callback" ? 10 : 15, () => finishCall(callType, withCallback));
  }

  function distract(distraction: string) {
    cancel("distraction", "text", "nudge", "focus");
    state.activity = { app: distraction, title: `${distraction} — For You`, url: null };
    state.verdict = { focus: "distracted", distraction, reason: `This looks like ${distraction}, rather than your current task.` };
    state.distracted_since = iso();
    state.stage = "distracted";
    emit("verdict", `Distracted: ${distraction}. Mom noticed.`, { ...state.verdict, ...state.activity });
    schedule("text", state.ladder.text_after_secs, () => { state.stage = "texted"; sendText("?"); });
    schedule("nudge", state.ladder.call_after_secs, () => startCall("nudge", true));
  }

  function tickTo(target: number) {
    const seconds = Math.max(0, target - time) / 1000;
    if (state.session && state.verdict?.focus === "on_task") state.stats.focused_secs += seconds;
    if (state.session && state.verdict?.focus === "distracted") state.stats.distracted_secs += seconds;
    time = target;
  }

  function advance() {
    const target = Math.max(time, now());
    while (actions[0] && actions[0].at <= target) {
      const next = actions.shift()!;
      tickTo(next.at);
      next.run();
    }
    tickTo(target);
    state.now = iso();
  }

  return {
    async getState() { advance(); return copy(state); },
    async getEvents(after) { advance(); return { events: copy(events.filter((event) => event.id > after)) }; },
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
      if (state.call_in_progress) throw new Error("Finish the current call before starting a new session.");
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
      schedule("distraction", 5, () => { if (!ignoredApps.has("TikTok")) distract("TikTok"); });
      if (parsed.until) schedule("deadline", (Date.parse(parsed.until) - time) / 1000, () => endSession("time_up"));
      return { ok: true, ...parsed };
    },
    async stopSession() { advance(); endSession("stopped"); return { ok: true }; },
    async notDistracted() {
      advance();
      if (!state.session) throw new Error("Start a session before telling Mom you're working.");
      if (state.activity) ignoredApps.add(state.activity.app);
      cancel("text", "nudge", "focus");
      setFocused("You told Mom this app is part of your work. She will remember for this session.", true);
      emit("text_in", "I'm actually working.", { text: "I'm actually working." });
      sendText("Okay, Mom trusts you. I won't flag this app again this session.");
      return { ok: true };
    },
    async testCall() {
      advance();
      if (state.call_in_progress) throw new Error("Mom is already on a call. Try again when it ends.");
      cancel("distraction", "text", "nudge", "focus", "callback");
      startCall("nudge", Boolean(state.session));
      return { ok: true };
    },
    async forceDistracted(distraction, seconds) {
      advance();
      if (!state.session) throw new Error("Start a session before forcing a distraction.");
      if (state.call_in_progress) throw new Error("Wait for the current call to finish before forcing a distraction.");
      if (!distraction.trim()) throw new Error("Enter the name of a distracting app.");
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw new Error("Choose a duration between 1 and 3,600 seconds.");
      cancel("callback");
      state.callback_at = null;
      distract(distraction.trim());
      schedule("focus", seconds, () => {
        cancel("text", "nudge");
        setFocused("The forced distraction has ended. Back to your task.");
      });
      return { ok: true };
    },
  };
}
