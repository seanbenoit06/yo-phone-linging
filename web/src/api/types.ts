export type Stage = "idle" | "watching" | "distracted" | "texted" | "calling" | "waiting_callback";
export type Focus = "on_task" | "distracted" | "unsure";
export type CallType = "nudge" | "callback" | "snitch";
export type ModuleHealth = { status: "ok" | "error" | "off"; message?: string };

export interface Settings {
  screen_monitoring: boolean;
  screenshots: boolean;
  webcam: boolean;
  detector_mode: "lockin" | "relaxed";
  detector_llm: "gemini" | "jev";
  demo_mode: boolean;
}

export type SettingsPatch = Partial<Settings>;

export interface SettingsResponse {
  settings: Settings;
  available: { screen: boolean; webcam: boolean };
  unavailable_reason: { screen?: string; webcam?: string };
}

export interface LogLine {
  id: number;
  at: string;
  source: string;
  message: string;
}

export interface LogsResponse { lines: LogLine[] }

export interface State {
  now: string;
  user_name: string;
  demo_mode: boolean;
  session: null | { goal: string; until: string | null; started_at: string };
  stage: Stage;
  activity: null | { app: string; title: string; url: string | null };
  verdict: null | { focus: Focus; distraction: string | null; reason: string };
  distracted_since: string | null;
  ladder: { text_after_secs: number; call_after_secs: number; callback_after_secs: number };
  call_in_progress: null | { call_type: CallType; started_at: string };
  callback_at: string | null;
  last_promise: string | null;
  missed_calls: number;
  excuses: string[];
  modules: { imessage: ModuleHealth; detector: ModuleHealth; calls: ModuleHealth; webcam: ModuleHealth };
  stats: { focused_secs: number; distracted_secs: number; calls_made: number; texts_sent: number };
  settings: Settings;
  monitor: {
    screen: {
      enabled: boolean;
      active: boolean;
      every_secs: number;
      last_check_at: string | null;
      next_check_at: string | null;
      method: "rule" | "ai" | "screenshot" | "forced" | null;
      latency_ms: number | null;
    };
    webcam: {
      enabled: boolean;
      active: boolean;
      last_check_at: string | null;
      verdict: null | { focus: Focus; distraction: string | null; reason: string };
      latency_ms: number | null;
      photo_at: string | null;
    };
  };
}

export type EventKind =
  | "session_started" | "session_ended"
  | "text_in" | "text_out"
  | "verdict"
  | "call_started" | "call_ended"
  | "error";

export interface Event {
  id: number;
  at: string;
  kind: EventKind;
  summary: string;
  data: Record<string, unknown>;
}

export interface TranscriptLine {
  role: "agent" | "user";
  message: string;
  time_in_call_secs: number;
}

export interface CallEndedData extends Record<string, unknown> {
  call_type: CallType;
  conversation_id: string;
  answered: boolean;
  duration_secs: number;
  promised_step: string | null;
  excuse: string | null;
  summary: string;
  transcript: TranscriptLine[];
}

export interface CommandResult {
  ok: boolean;
  goal?: string;
  until?: string | null;
  error?: string;
}

export interface Task {
  id: string;
  source: "canvas" | "trello" | "calendar";
  title: string;
  context: string;
  due_at: string | null;
  url: string | null;
  points: number | null;
}

export interface SourceStatus {
  status: "ok" | "error" | "off";
  synced_at: string | null;
  message?: string;
}

export interface TaskResponse {
  tasks: Task[];
  sources: Record<string, SourceStatus>;
}

export type SessionInput = string | { goal: string; until: string | null };

export interface ApiClient {
  getState(): Promise<State>;
  getEvents(after: number): Promise<{ events: Event[] }>;
  getTasks(): Promise<TaskResponse>;
  getSettings(): Promise<SettingsResponse>;
  updateSettings(patch: SettingsPatch): Promise<SettingsResponse & { ok: true }>;
  getLogs(after: number): Promise<LogsResponse>;
  getWebcamPhoto(timestamp: number, signal?: AbortSignal): Promise<Blob | null>;
  startSession(input: SessionInput): Promise<CommandResult>;
  stopSession(): Promise<CommandResult>;
  notDistracted(): Promise<CommandResult>;
  testCall(): Promise<CommandResult>;
  forceDistracted(distraction: string, seconds: number): Promise<CommandResult>;
}
