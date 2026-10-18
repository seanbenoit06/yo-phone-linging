# Mom.exe Dashboard: UI Spec

A local web dashboard to watch Mom.exe think in real time, and to tell Mom what you're doing.
Built by Codex in `web/`. The data comes from a small local API in the Python app (`main.py`),
built separately by the core owner. Until that API exists, the UI runs on a **mock API** (section 6).

## 1. Context (read first)

Mom.exe is an AI accountability "Asian mom". While you work, it watches your screen. When you drift
(TikTok, Instagram, ...), it climbs an escalation ladder:

1. Distracted for a while → Mom texts you a check-in on iMessage ("Jay, what are you doing? TikTok?? You said CSE homework. Mom is watching 👀")
2. Still distracted → Mom **phone-calls** you. On the call she asks what's blocking you, breaks the
   task into ONE 5-minute step, and gets a verbal promise.
3. After the call → follow-up text quoting your promise → Mom **calls back** later to check.
4. You ignore her call → she calls your opted-in **friend** to snitch.

You start a session by telling Mom what you're doing, e.g. `CSE homework until 9 PM`
(today by iMessage; the dashboard adds a second way). If Mom is wrong, you say
"I'm actually working" and she never flags that app again this session.

The dashboard is shown on a projector during a 3-minute live demo, so it must be readable from
the back of a room and look polished. Judges score "craft".

## 2. Platform and stack

- Local web app, desktop browser only (macOS and Windows). Not deployed.
- **React + Vite + TypeScript**, styling with **Tailwind CSS** using CSS variables for theme tokens.
- Allowed extras: `lucide-react` (icons), `framer-motion` (subtle motion), Google Fonts.
  No component framework (no MUI / Chakra / shadcn CLI), no state library (React state + hooks is enough),
  no router library needed (simple in-app view state is fine).
- Dev server on **http://localhost:3000**. Vite proxies `/api/*` to the Python API at
  **http://127.0.0.1:8765**.
- Everything lives in **`web/`**. Do not edit files outside `web/`, except adding one line to
  the root `.gitignore` for `web/node_modules/` and `web/dist/` if needed.
- npm scripts must work on Windows and macOS (no `export FOO=...`, no bash-only syntax).
- Repo language is English: code, comments, commit messages, docs.

## 3. Layout

Desktop-first, 1280–1920 px wide, still usable at 1024 px. Inspired by Wispr Flow's desktop app:
a left sidebar and a large rounded content panel on a soft background.

### Sidebar (left, ~260 px)
- Logo: "Mom.exe" + a small badge (e.g. "beta").
- Nav: **Today** (default), **Calls**, **Tasks**, **Settings**.
- Bottom: module health dots for `imessage`, `detector`, `calls`, `webcam`
  (green = ok, red = error with the message on hover, grey = off), and the API connection state.

### Today (main view)
Top to bottom, with a right column on wide screens:

1. **Greeting**: "Welcome back, {user_name}" (theme may change the copy, e.g. "Jay, you ate yet?").
2. **Session hero card** (the big card):
   - **Idle**: headline "What are we doing?", a text input (placeholder `CSE homework until 9 PM`),
     a **Tell Mom** button, and 3 example chips that fill the input
     (`CSE homework until 9 PM`, `Finish the essay by 11 PM`, `Study for the midterm until 10`).
     Enter submits. Show the API's error inline if parsing fails.
   - **Active**: headline "{goal}" with "until {9:00 PM}" and time left (or "no deadline"),
     buttons **I'm actually working** and **Done** (stops the session; ask for an inline confirm first).
3. **Escalation ladder** (only in an active session): a horizontal stepper
   `Watching → Check-in text → Call → Callback`, plus a separate `Snitch` marker shown only if it happened.
   Highlight the current `stage`. While distracted, show a live timer
   ("Distracted 0:18 · call at 0:25") with a progress bar toward the next step, using `ladder` thresholds.
   While calling, pulse the Call step and show "Mom is on the phone…".
   While waiting for the callback, show a countdown to `callback_at`.
4. **Right now** card: the current app + window/tab title, and a verdict pill
   (`On task` / `Distracted: TikTok` / `Not sure`) with the one-line `reason` in small text.
5. **Promise** card (when `last_promise` is set): "You promised Mom: {last_promise}".
6. **Today timeline**: like Wispr's "TODAY" list. One row per event: time on the left,
   an icon per `kind`, the `summary`, and for `call_ended` an expand button that reveals the transcript
   (Mom vs You, with `m:ss` timestamps) and the promise / excuse. Newest at the top. Search box filters rows.

Right column (stacks under the main column below ~1200 px):
- **Stats** card, big display numbers like Wispr's ("10.3K total words"):
  `{focused_minutes} min focused`, `{distracted_minutes} min distracted`, `{calls_made} calls`,
  `{texts_sent} texts`.
- **Mom's mood** meter: a fun gauge derived on the client from the stage
  (idle / watching = calm, distracted = suspicious, texted = annoyed, calling = furious,
  waiting_callback = hopeful). Pure decoration.
- **Excuses** card: the list from `excuses` ("Mom remembers: 'I don't know how to start'").

### Calls
A list of all `call_ended` events (newest first): call type, time, answered or not, duration,
promise, excuse, and the full transcript. Empty state: "No calls yet. Mom is being patient."

### Tasks
- A list from `GET /api/tasks`, sorted by `due_at` (soonest first), grouped as **Overdue**, **Today**,
  **This week**, **Later**. Each row: `context` as a colored pill (e.g. `MATH 208`), `title`,
  relative due time ("due tomorrow 11:59 PM"), points if present, an **Open** link (`url`, new tab),
  and a **Start with Mom** button.
- **Start with Mom** opens an inline picker: **30 min**, **1 hour**, **2 hours**, **Until due**.
  It then sends `POST /api/session/start` with `{ "goal": "{context} {title}", "until": <now + choice, or due_at> }`
  and switches to Today.
- A source status line on top from `sources` (e.g. "Canvas · synced 2 min ago", or the error message).
- **Trello** and **Google Calendar** stay as "coming soon" cards with a disabled **Connect** button.
- The Today view's idle hero card also shows the 3 soonest tasks as chips under the example chips.
  Clicking one opens the same duration picker.

### Settings
- **Theme picker** (section 5), saved in `localStorage`.
- Read-only: demo mode on/off and the `ladder` thresholds, `user_name`.
- **Test call** button: places a real call. It must show an inline confirm
  ("Your phone will ring. Call now?") before sending `POST /api/test-call`.
- **Demo controls** (collapsed by default): **Force distracted** (distraction text input, default
  `TikTok`, and seconds, default `60`) → `POST /api/demo/force-distracted`. This is a safety net
  for the live demo if the screen detector misbehaves on stage.
- **Use mock API** toggle (section 6).

### Global states
- **API unreachable**: a slim banner "Can't reach Mom. Is `python main.py` running?" and keep
  showing the last known data. Retry automatically.
- **Loading**: skeletons, never a blank page.
- Never `alert()` / `confirm()`; use inline confirms.

## 4. API contract

Base URL `/api` (proxied to `http://127.0.0.1:8765`). JSON everywhere. Times are ISO 8601
with a timezone offset. Phone numbers are never returned unmasked.

### `GET /api/state` → `State`
Poll every **1 s**.

```ts
type Stage = "idle" | "watching" | "distracted" | "texted" | "calling" | "waiting_callback";
type Focus = "on_task" | "distracted" | "unsure";
type CallType = "nudge" | "callback" | "snitch";
type ModuleHealth = { status: "ok" | "error" | "off"; message?: string };

interface State {
  now: string;
  user_name: string;
  demo_mode: boolean;
  session: null | { goal: string; until: string | null; started_at: string };
  stage: Stage;
  activity: null | { app: string; title: string; url: string | null };
  verdict: null | { focus: Focus; distraction: string | null; reason: string };
  distracted_since: string | null;     // start of the current distraction streak
  ladder: { text_after_secs: number; call_after_secs: number; callback_after_secs: number };
  call_in_progress: null | { call_type: CallType; started_at: string };
  callback_at: string | null;
  last_promise: string | null;
  missed_calls: number;
  excuses: string[];
  modules: { imessage: ModuleHealth; detector: ModuleHealth; calls: ModuleHealth; webcam: ModuleHealth };
  stats: { focused_secs: number; distracted_secs: number; calls_made: number; texts_sent: number };
}
```

### `GET /api/events?after={id}` → `{ events: Event[] }`
Poll every **1 s** with the last seen `id` (start with `after=0`, which returns the latest 200).
Oldest first in the response; the UI shows newest first.

```ts
type EventKind =
  | "session_started" | "session_ended"
  | "text_in" | "text_out"
  | "verdict"                 // only when the focus changes, not every check
  | "call_started" | "call_ended"
  | "error";

interface Event {
  id: number;                 // increasing
  at: string;
  kind: EventKind;
  summary: string;            // one line, ready to display
  data: Record<string, unknown>;
}
```

`data` per kind:
- `session_started`: `{ goal, until }` · `session_ended`: `{ goal, reason: "stopped" | "time_up" }`
- `text_in` / `text_out`: `{ text }`
- `verdict`: `{ focus, app, title, distraction, reason }`
- `call_started`: `{ call_type, opening_line }`
- `call_ended`: `{ call_type, conversation_id, answered, duration_secs, promised_step, excuse, summary,
  transcript: { role: "agent" | "user"; message: string; time_in_call_secs: number }[] }`
- `error`: `{ source, message }`

### `GET /api/tasks` → `{ tasks: Task[], sources: Record<string, SourceStatus> }`
Fetch on load and every **60 s** (the server caches the sources for a few minutes).

```ts
interface Task {
  id: string;              // "canvas:assignment:123"
  source: "canvas" | "trello" | "calendar";
  title: string;           // "Week 3 Conceptual Problems"
  context: string;         // short course / board name: "MATH 208"
  due_at: string | null;   // ISO 8601
  url: string | null;
  points: number | null;
}
interface SourceStatus { status: "ok" | "error" | "off"; synced_at: string | null; message?: string }
```

### Commands
All return `200 { "ok": true, ... }` or `4xx { "ok": false, "error": "readable message" }`.
Commands go through the same path as iMessage, so Mom also texts her usual reply.

| Method + path | Body | Effect |
|---|---|---|
| `POST /api/session/start` | `{ "text": "CSE homework until 9 PM" }` or `{ "goal": "...", "until": "ISO or null" }` | Start a session. Returns `{ ok, goal, until }`. `400` if the text can't be parsed. |
| `POST /api/session/stop` | `{}` | End the session. |
| `POST /api/not-distracted` | `{}` | "I'm actually working": stop flagging the current app. |
| `POST /api/test-call` | `{}` | Place one real nudge call now. |
| `POST /api/demo/force-distracted` | `{ "distraction": "TikTok", "seconds": 60 }` | Treat the user as distracted for N seconds. |

## 5. Themes: build 3, switchable at runtime

Same components and layout for all three. A theme changes **tokens** (colors, fonts, radius, shadows),
**copy tone** (greeting, empty states, mood labels), and may add **decorations** (backgrounds, ornaments,
stickers). Implement themes as CSS variable sets on `<html data-theme="...">` plus a small
`themes.ts` for copy and decoration flags. Load fonts from Google Fonts.

1. **`flow`**: calm and premium, inspired by Wispr Flow (reference screenshot from Jay).
   Warm off-white background (~`#F5F3EF`), white content panel and cards with 20–24 px radius,
   hairline borders, almost no shadow. Serif display font for headlines and big numbers
   (e.g. Instrument Serif or Fraunces), clean sans for body (e.g. Inter). Muted purple accent
   for progress bars and the active step. A dark, softly blurred gradient hero card with light serif text.
2. **`mom`**: Chinese mom's kitchen. Warm Chinese red and gold, rice-paper texture background,
   red "spring couplet" style accents, a brush-calligraphy display font for short Chinese accents
   (e.g. Ma Shan Zheng), cozy rounded cards like sticky notes. Copy mixes English with Mom's
   Chinglish ("Aiyah", "You ate yet?", "Cousin Kevin would never"). Mood labels like "Mom is sharpening the slipper".
3. **`portal`**: maximalist Chinese web portal / super-app energy (think 2010s Taobao / Weibo
   homepages). Bright red-orange gradients, "HOT" and "NEW" badges, a scrolling marquee of Mom's
   nagging lines, denser cards, playful but still readable. Use it for fun, not clutter: the ladder,
   timeline and session card must stay clear.

The `mom` and `portal` themes may show a few Chinese characters as decorative UI copy
(e.g. a calligraphy "Mom" character, a "hot" badge). Keep them in `themes.ts`, keep all code,
comments and docs in English, and make sure every Chinese accent has an English line nearby
so the judges understand it.

Show a theme picker in Settings with a live preview thumbnail per theme. Also add a small
theme switcher in the sidebar footer so Jay can flip themes quickly while comparing.
Default theme: `flow`.

## 6. Mock API

The UI must run fully without the Python app, so it can be built and demoed in parallel.

- `web/src/api/mock.ts` implements the same functions as the real client, in memory.
- Enabled when the URL has `?mock=1`, or the Settings toggle is on (saved in `localStorage`),
  or `VITE_USE_MOCK=1`.
- The mock plays a scripted demo with `demo_mode: true` timings (text at 10 s, call at 25 s,
  callback at 45 s): idle → `POST /api/session/start` → watching → distracted on TikTok →
  check-in text → calling (≈15 s) → `call_ended` with the transcript below → promise text →
  waiting_callback → callback call → done. Commands work against the mock state.

Use this real transcript (from a live test call) for the mock `call_ended`:

```json
{
  "call_type": "nudge", "answered": true, "duration_secs": 48,
  "promised_step": "open your laptop and find the file", "excuse": "I don't know how to start",
  "transcript": [
    { "role": "agent", "time_in_call_secs": 0,  "message": "Jay! 5 min on TikTok?! Cousin Kevin would never. What are you stuck on with CSE homework?" },
    { "role": "user",  "time_in_call_secs": 9,  "message": "I don't know how to start." },
    { "role": "agent", "time_in_call_secs": 18, "message": "Okay okay, don't panic. Just open the assignment PDF and read problem one out loud. Promise?" },
    { "role": "user",  "time_in_call_secs": 25, "message": "I don't wanna." },
    { "role": "agent", "time_in_call_secs": 26, "message": "Aiyah, I hear you. Just open the PDF, that's it, you don't even have to read it yet. Promise?" },
    { "role": "user",  "time_in_call_secs": 34, "message": "No, I don't." },
    { "role": "agent", "time_in_call_secs": 35, "message": "Okay okay, Mom makes it even smaller. Just open your laptop and find the file. That's all. Promise?" },
    { "role": "user",  "time_in_call_secs": 43, "message": "Okay." },
    { "role": "agent", "time_in_call_secs": 44, "message": "Good! Mom calls back in five minutes. Bye bye!" }
  ]
}
```

Mock `GET /api/tasks` with realistic UW courses, for example (due dates relative to "now"):
`MATH 208` "Week 3 Conceptual Problems" (5 pts, due in 2 days), `INFO 200` "Knowledge Checkpoint Quiz"
(50 pts, due tomorrow 3 PM), `PSYCH 210` "Week 3 Writing Assignment" (10 pts, due tomorrow 11:59 PM),
`INFO 200` "Intro + Part I Study Guide" (20 pts, due in 5 days), and one overdue item.
`sources`: `{ "canvas": { "status": "ok", "synced_at": <now - 2 min> } }`.

Mom's real text messages, for mock `text_out` events:
`OK Jay. CSE homework until 9:00 PM. Mom is watching. 👀` · `Jay, what are you doing? TikTok?? You said CSE homework. Mom is watching 👀` ·
`You promised Mom: open your laptop and find the file. I'm calling back in 1 min. Don't make me call your cousin.` ·
`Good. Mom is proud. Now keep going.`

## 7. Code layout (suggested)

```
web/
  index.html
  package.json, vite.config.ts, tsconfig.json, tailwind config, postcss config
  src/
    main.tsx, App.tsx
    api/types.ts        // section 4 types, copied exactly
    api/client.ts       // real fetch client + polling hooks (useAppState, useEvents)
    api/mock.ts         // section 6
    themes/themes.ts    // copy + decoration flags per theme
    themes/*.css        // CSS variable sets
    components/         // Sidebar, SessionCard, Ladder, RightNow, PromiseCard, Timeline,
                        // CallTranscript, StatsCard, MoodMeter, ExcusesCard, ThemePicker, Banner
    views/              // Today, Calls, Tasks, Settings
```

## 8. Acceptance criteria

- `cd web && npm install && npm run dev` opens http://localhost:3000 on macOS and Windows.
- With `?mock=1`, the full scripted demo plays end to end with no console errors.
- All three themes look intentional and finished; switching is instant and remembered.
- Readable on a projector: body text ≥ 16 px, headline and stage visible from far away.
- Starting a session from the hero card, "I'm actually working", Done, Test call (with confirm)
  and Force distracted all call the right endpoint with the right body.
- API down → banner, last data stays, auto-recovers when the API comes back.
- `npm run build` passes with no TypeScript errors.
- No secrets, keys or phone numbers anywhere in `web/`.

## 9. v2: Monitoring and controls (Family Computer edition)

Goal: when Jay shows Mom.exe to people, they can **see** that Mom is watching (screen and camera),
read Mom's log live, and flip the real settings from the dashboard. The Control Panel is no longer read-only.

### New windows (desktop icons in the left sidebar)

1. **Mom's Eyes** (icon: eye). Two panes side by side (stacked below ~1200 px):
   - **Screen**: current `activity` (app, title, URL host only), the verdict pill, a **method badge**
     (`Rule`, `AI`, `AI + screenshot` with a camera icon, `Forced`), "checked 2 s ago · next in 1 s"
     from `monitor.screen`, and a subtle scanning animation while it's actively checking.
     States: *Paused* (screen monitoring off), *Waiting for a session* (no session), *Can't see the screen*
     (`modules.detector` error, show its message), *Not available on this computer* (`available.screen` false).
     When the method is `AI + screenshot`, show "Took a screenshot, looked, deleted it." Never show the screenshot.
   - **Camera**: a CCTV / old-TV styled frame showing the latest photo from `GET /api/webcam/photo`,
     refreshed every 3 s while this window is open (add `?t=<timestamp>` to bust the cache), a red **REC**
     dot while the camera is on, the webcam verdict pill (`Phone in hand!` / `Focused` / `Not sure`),
     "photo 2 s ago", and the line "Photos stay in memory. Nothing is saved."
     States: *Camera off*, *Not available on this computer*, *Waiting for the first photo*,
     error from `modules.webcam`. Outside a session the photo still refreshes (preview) but the verdict says
     "Mom only judges during a session".
2. **Mom's Log** (icon: terminal). A retro Command Prompt window: monospace, dark background, auto-scroll,
   one line per log entry `23:05:09 [call] 📞 nudge call starting`, colored by `source`
   (`detect`, `text`, `call`, `webcam`, `api`, `main`, `brain`). Controls: pause / resume auto-scroll,
   a source filter, and clear-view (client side only). Polls `GET /api/logs` every 1 s.

### Control Panel (Settings) becomes real

Replace the read-only "Behind the scenes" block with switches that call `POST /api/settings` and show
saving / saved / error inline. Keep `Your name` read-only. Show the ladder numbers under the demo switch
(they change when demo timing flips).

| Switch | Field | Notes |
|---|---|---|
| Screen monitoring | `screen_monitoring` | Off → Mom stops looking at the screen. |
| Screenshot second look | `screenshots` | Only when the title is unclear. Disabled while screen monitoring is off. |
| Camera | `webcam` | Disabled with the reason when `available.webcam` is false. |
| Lock-in mode | `detector_mode` | `lockin` (other work counts as distracted) / `relaxed`. |
| Demo timing | `demo_mode` | Fast ladder (10 s / 25 s / 45 s) vs real (2 min / 5 min / 5 min). |
| AI model | `detector_llm` | `gemini` / `jev` (a segmented control). |

Settings changes apply immediately and survive restarts. The dashboard never shows or edits phone numbers or keys.

### API additions

```ts
interface Settings {
  screen_monitoring: boolean;
  screenshots: boolean;
  webcam: boolean;
  detector_mode: "lockin" | "relaxed";
  detector_llm: "gemini" | "jev";
  demo_mode: boolean;
}
interface SettingsResponse {
  settings: Settings;
  available: { screen: boolean; webcam: boolean };
  unavailable_reason: { screen?: string; webcam?: string };   // why it's not available, if not
}

// Added to State:
interface State {
  // ...everything in section 4...
  settings: Settings;
  monitor: {
    screen: {
      enabled: boolean;              // screen_monitoring && available
      active: boolean;               // enabled and a session is running
      every_secs: number;
      last_check_at: string | null;
      next_check_at: string | null;
      method: "rule" | "ai" | "screenshot" | "forced" | null;
      latency_ms: number | null;
    };
    webcam: {
      enabled: boolean;              // webcam && available
      active: boolean;               // judging (enabled and a session is running)
      last_check_at: string | null;  // last time Gemini judged a photo
      verdict: null | { focus: Focus; distraction: string | null; reason: string };
      latency_ms: number | null;
      photo_at: string | null;       // when the latest photo was taken (judged or preview)
    };
  };
}
```

| Method + path | Body / query | Response |
|---|---|---|
| `GET /api/settings` | | `SettingsResponse` |
| `POST /api/settings` | any subset of `Settings` | `{ ok: true, ...SettingsResponse }` or `400 { ok: false, error }` (unknown key, wrong type, or turning on something unavailable) |
| `GET /api/webcam/photo` | `?t=` ignored | `200 image/jpeg` (latest photo, `Cache-Control: no-store`), or `404 { ok: false, error }` when there's none. Each request also keeps the camera preview running for 10 s when no session is active. |
| `GET /api/logs?after={id}` | `after=0` returns the latest 300 | `{ lines: { id: number; at: string; source: string; message: string }[] }`, oldest first |

### Mock mode

`mock.ts` must cover all of this: settings that toggle in memory, a monitor that ticks (checked / next),
a placeholder camera image (generate an SVG or canvas image, no real photos in the repo), and a log stream
that matches the scripted demo (`[detect] distracted: TikTok`, `[text] → ?`, `[call] 📞 nudge call starting`, ...).

## 10. Guest call: let a judge get the call

Goal: at judging, a judge types their own name, phone number and a class, and Mom calls **them** once, by
name, about that class. This is the strongest live moment, so the flow must be fast and obvious.

Voice only: iMessage can't reach numbers that aren't assigned to the Photon shared line, so a guest gets
the call but not the texts. A guest call never changes the running session (like Test call).

### Window: "Let Mom call you" (new desktop icon in the left sidebar, icon: phone with a plus)

- **Name** (required, max 40 characters).
- **Phone** (required). Accepts `(425) 555-1234`, `425-555-1234`, `+1 425 555 1234`; show it normalized as
  `+1 (425) 555-1234` on blur. US numbers by default; a leading `+` allows other countries.
- **What should you be doing?** (optional, max 120). A text field with suggestions from the class contexts in
  `GET /api/tasks` (e.g. `MATH 208`, `INFO 200`) plus `CSE 143 homework`, `Studying for the midterm`.
  Default when empty: `your homework`.
- **What are you doing instead?** (optional): `TikTok` (default), `Instagram`, `YouTube`, `your phone`.
- **Consent checkbox** (required): "I agree to get one phone call from Mom.exe, an AI, right now."
- **Have Mom call me** button → inline confirm "Your phone will ring in a few seconds." → `POST /api/guest-call`.
- Status line: sending → "Calling {name}…" while `call_in_progress` exists → "Call ended" with a link to Calls.
- After a successful send, clear the phone field. Never put the number in `localStorage`, the URL or logs.
- Disabled while any call is in progress (show why). Show the server's error text for 400 / 409 / 429.
- Mock mode: simulate the call (call_started → ~15 s → call_ended with a short transcript that uses the guest's
  name and class).

### API

| Method + path | Body | Response |
|---|---|---|
| `POST /api/guest-call` | `{ "name": "Alex", "phone": "(425) 555-1234", "goal": "CSE 143 homework", "distraction": "TikTok", "consent": true }` | `200 { ok: true }`; `400 { ok: false, error }` for a missing / invalid field or `consent` not `true`; `409` when a call is already in progress; `429` when a guest call was placed in the last 60 s |

- The phone number is never returned, logged or shown unmasked anywhere (state, events, logs).
- Timeline: `call_started` / `call_ended` events for a guest call carry `guest_name` in `data`, and their
  `summary` says "Guest call to {name}". `State.call_in_progress` gains an optional `guest_name: string`.
