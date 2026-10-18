# Mom.exe — Family Computer edition

The selected Mom.exe interface is **Family Computer**, a retro desktop with teal wallpaper, beveled windows, a taskbar, and a Mom call-status window. It is the default dashboard at `/`. It uses the existing real/mock API contract and provides Today, Tasks, Calls, Guest Call, Mom’s Eyes, Mom’s Log, and editable Settings.

The original Flow, Mom, and Portal dashboard remains at `/?edition=classic`. The Style room remains available for comparing the original design studies. [CLAUDE.md](./CLAUDE.md) is the frontend continuation entry point; [CLAUDE_HANDOFF.md](./CLAUDE_HANDOFF.md) provides the implementation map, verification evidence, and a ready-to-paste continuation prompt.

## Start on macOS or Windows

1. Install Node.js **22.12 or newer within the 22.x series**, or **24 or newer**, with npm. The package engine range is `^22.12.0 || >=24.0.0`.
2. Open Terminal on macOS, or PowerShell/Command Prompt on Windows, in the repository directory.
3. Enter the frontend directory:

   ```text
   cd web
   ```

4. Install dependencies:

   ```text
   npm install
   ```

5. Start Vite:

   ```text
   npm run dev
   ```

6. The script opens a browser. Open [http://localhost:3000/?mock=1](http://localhost:3000/?mock=1) for a demo that does not need Python. Confirm that the interface identifies the source as mock data.
7. Keep the terminal running. Press **Ctrl+C** in that terminal when finished.

Do not double-click `index.html`: the application must be served by Vite. The server binds to `127.0.0.1` on port `3000` and will not silently choose a different port. If that port is occupied, identify the existing server before stopping anything; another session may own it. All npm scripts use cross-platform commands, with no shell-specific environment-variable syntax. Windows execution has not been verified on an actual Windows machine.

## Choose an edition

| URL | Purpose |
| --- | --- |
| [/?mock=1](http://localhost:3000/?mock=1) | Selected Family Computer dashboard, connected to the in-memory API. |
| [/?mock=0](http://localhost:3000/?mock=0) | Family Computer connected to the local Python API. |
| [/?edition=classic&mock=1](http://localhost:3000/?edition=classic&mock=1) | Original dashboard, with Flow, Mom, and Portal themes. |
| [/style-lab.html?concept=momOS](http://localhost:3000/style-lab.html?concept=momOS) | Original Family Computer design study, using local sample scenes. |

The selected Family Computer layout supersedes the original spec's Flow default and sidebar layout. The original three themes and all three Style room concepts are preserved. The production dashboard uses API state; the Style room uses independent sample scenes and is not an API integration test.

## Use Family Computer

- Open Today/Study Control to tell Mom a goal, monitor the current app and escalation stage, inspect activity, or end a session with inline confirmation.
- Open Tasks/My Homework to see assignments and source health. **Start with Mom** offers **30 min**, **1 hour**, **2 hours**, and **Until due**, then returns to Today.
- Open Calls for completed conversations, answers or missed calls, duration, promises, excuses, and transcripts.
- Open Guest Call (phone-plus icon) to let a consenting guest receive one personalized AI call. See the Guest Call walkthrough below.
- Open Eyes (eye icon) for **Mom's Eyes**: screen activity, verdict, detection method and timing, plus a memory-only camera preview. Camera images refresh every three seconds only while Eyes is visible. Outside a session the camera previews without judging.
- Open Log (terminal icon) for **Mom's Log**: live colored entries, a source filter, Pause/Resume scrolling, and Clear view. Pausing scrolling does not stop receiving entries. Clear view does not erase backend logs.
- Open Settings for immediate monitoring controls: Screen monitoring, Screenshot second look, Camera, Lock-in mode, Demo timing, and AI model. Each change shows Saving, Saved, or a readable error. Unsupported controls explain why; screenshots are disabled while screen monitoring is off. Your name remains read-only.
- Settings also retains the API source, confirmed Test call, and collapsed Demo controls.
- Use window controls to minimize or enlarge a window, and the taskbar or navigation to restore it. Minimizing a window does not stop the session or polling.
- Mom Messenger reflects actual events. The taskbar and health indicators reflect the active API source.

The call window is a status display. **Answer the actual call on your phone.** The API has no browser answer or hangup endpoint. The original Style room's simulated answer button is a design-study interaction, not a production capability.

Use a desktop browser at 1280–1920 pixels wide for the demo; the interface must remain usable at 1024 pixels. Fonts load from Google Fonts, with local fallbacks when offline.

## Monitoring behavior

Family Computer implements section 9 of `docs/UI_SPEC.md`. The classic dashboard keeps its original read-only settings block and theme picker; the Style room remains an independent design prototype.

- **Settings:** saves send one changed field and wait for the API acknowledgement. A background `GET /api/settings` runs every 10 seconds to refresh saved values, capabilities, and unavailable reasons. Initial-load failures retry every five seconds. Writes serialize, older responses cannot undo newer saves, and background reads do not disable the controls. Real settings are saved by the Python app; mock settings remain in memory.
- **Eyes:** camera photos refresh every three seconds only when the Eyes window and browser document are visible and the camera is available and enabled. Leaving the window, changing API source, or switching the camera off aborts requests and releases image object URLs. No photo files are written. The backend may keep its idle preview alive for up to 10 seconds after the last request, as defined by its preview lease.
- **Photo age:** the image overlay reports when the displayed image was downloaded. A separate readout reports the latest server photo timestamp. These remain distinct so a failed download cannot make an older displayed image look newly captured.
- **Screen status:** only the URL host is shown. A screenshot second look displays the specified deletion message, never the screenshot itself. The subtle scan animation is inferred from the scheduled check time; the API has no separate in-flight-check flag.
- **Log:** after the window is first opened, logs poll every second and retain the newest 1,000 lines. Minimize does not stop that polling. Pause/Resume affects scrolling only. Clear view clears the local buffer while retaining the cursor; backend history is unchanged.

The camera can preview while idle. Camera judgment and screen monitoring require a session. Unavailable features, module errors, missing photos, and disabled monitoring have explicit states.

## Guest Call

Family Computer implements section 10 of `docs/UI_SPEC.md` through the **Guest Call** desktop icon and the **Let Mom call you** window.

1. Open `/?mock=1`, then select **Guest Call** in the left navigation or Mom Menu.
2. Enter the guest's name and phone, choose or type a class/goal, and choose a distraction. Class suggestions come from Tasks. An empty goal becomes `your homework`.
3. Check **I agree to get one phone call from Mom.exe, an AI, right now.**
4. Select **Have Mom call me**, review the inline confirmation, and confirm the call. Mock mode never contacts a phone.
5. Watch the sending/waiting/calling status. After about 15 seconds in mock mode, open Calls to read the personalized transcript.

US phone input is formatted on blur; a leading `+` accepts an international number. The phone field is cleared after the API acknowledges the request. It is never copied into local storage, the URL, event history, logs, or screenshots. Consent is not saved. Guest calls send no texts and do not replace the current study session or its promises. Any active call blocks another call, and the mock API mirrors the backend's 60-second guest-call cooldown. Server validation, busy, and cooldown errors are shown inline.

An acknowledgement may arrive before the call appears in state. The UI waits for matching guest call state/events rather than treating an immediate empty call state as completion. It never retries a call automatically. In real mode the final confirmation places an actual call; **do not use it for testing unless Jay is present and explicitly agrees**.

## Run the scripted mock demo

1. Open `/?mock=1` and start a session with a future deadline, for example a task with a **30 min** duration.
2. Keep **Screen monitoring** and **Demo timing** enabled, then let the sequence run without interrupting it. The default sequence takes about **100 seconds**:

   | Time since session start | Event |
   | --- | --- |
   | 0 seconds | Watching; Mom acknowledges the session. |
   | 5 seconds | TikTok distraction begins. |
   | 15 seconds | Mom texts `?`, 10 seconds into the distraction. |
   | 30 seconds | Nudge call starts, 25 seconds into the distraction. |
   | 45 seconds | Nudge call ends; the promise and callback countdown appear. |
   | 90 seconds | Callback starts, 45 seconds after the nudge ends. |
   | 100 seconds | Callback ends; Mom sends the final text and the session ends. |

3. Expand the completed call in the Today timeline, or open Calls to read its transcript.
4. Start another session to test **I'm actually working** and the confirmed **Done** action.
5. In Settings, expand Demo controls to force a distraction during an active session. Defaults are TikTok and 60 seconds.
6. Test call requires an inline confirmation. In mock mode it simulates a call; in real mode it asks the Python app to place an actual call.

The provided nudge transcript retains its recorded **48-second** duration and timestamps. Its simulated on-screen call lasts about **15 seconds**. The transcript and follow-up text retain their original five-minute/one-minute wording; the countdown uses the configured 45-second demo delay.

Mock sessions, events, statistics, monitoring settings, logs, and tasks live in memory and reset on a full reload. API-source and classic-theme preferences persist in local storage. Sample deadlines are relative to mock initialization.

## Tasks

`GET /api/tasks` runs on load and every **60 seconds**. Tasks sort by due date and group into Overdue, Today, This week, and Later. Rows show context, title, relative deadline, optional points, and an external Open link when supplied. Source status shows the last synchronization time or source error.

Task starts send `{ goal, until }`; the goal combines the task context and title. The idle session also offers the three soonest assignments with the same duration picker. “This week” means the next seven calendar days. Missing deadlines sort into Later. Until due is disabled for missing or past deadlines.

Mock records are sample UW coursework, not live assignments. Mock task URLs are intentionally empty, so their Open actions are disabled. Trello and Google Calendar remain coming-soon cards with disabled Connect buttons.

## Connect the Python API

The core owner maintains Python and its configuration separately. Follow that owner's setup instructions to serve the API at **http://127.0.0.1:8765**. The frontend does not start Python.

Run `npm run dev`, then open `/?mock=0` or turn off Use mock API in Settings. Vite proxies `/api/*` to the local Python API.

| Request | Use |
| --- | --- |
| `GET /api/state` | Session, activity, stages, health, promise, and stats; every second. |
| `GET /api/events?after={id}` | Incremental activity and call history; every second. |
| `GET /api/tasks` | Tasks and source status; every 60 seconds. |
| `GET /api/settings` | Current controls, platform capabilities, and unavailable reasons; initial load and every 10 seconds. Initial failures retry every five seconds. |
| `POST /api/settings` | One changed setting as a partial settings object; acknowledgement supplies the saved values. |
| `GET /api/webcam/photo?t={timestamp}` | Memory-only camera image, every three seconds while Eyes is visible and the camera is enabled; 404 means waiting for a photo. |
| `GET /api/logs?after={id}` | Incremental logs every second once the Log window has been opened; its view retains the newest 1,000 lines. |
| `POST /api/session/start` | `{ text }` from free text or `{ goal, until }` from a task. |
| `POST /api/session/stop` | `{}` after inline confirmation. |
| `POST /api/not-distracted` | `{}` to accept the current app for this session. |
| `POST /api/test-call` | `{}` after inline confirmation. |
| `POST /api/guest-call` | `{ name, phone, goal, distraction, consent: true }` after consent and inline confirmation; voice-only, independent of the study session. |
| `POST /api/demo/force-distracted` | `{ distraction, seconds }`. |

System Status shows `imessage`, `detector`, `calls`, and `webcam`, with any supplied health message displayed inline. The classic dashboard offers those details on hover or keyboard focus. When the API becomes unreachable, the dashboard preserves the last successful snapshot, shows a banner, and retries automatically.

An explicit `?mock=0` or `?mock=1` takes precedence over the saved Settings value and `VITE_USE_MOCK=1`. The Settings toggle updates both the URL and local preference. Use only non-sensitive frontend configuration; never put credentials or contact details in `web/`.

## Check and build

Run from `web`:

```text
npm test
npm run build
```

The test suite covers the API contract, deterministic mock transitions, monitoring settings, concurrent reads/writes, log cursors, photo cancellation and object-URL cleanup, monitoring states, desktop window state, and Messenger event selection. The build checks TypeScript and creates `web/dist` with the dashboard and Style room entries.

To preview compiled output, stop your development server first, then run:

```text
npm run preview
```

Open `/?mock=1` for a standalone preview. Use `npm run dev` for Python integration; do not assume the production-preview server provides the development API proxy.

## Verification and remaining work

The v3 source passed **86/86 tests** and `npm run build`. New coverage checks guest API bodies and 400/409/429 errors, validation/cooldown, session independence and call overlap, phone privacy, delayed and same-name events, duplicate requests, and source teardown.

In the native browser, the mock guest flow was exercised with two different names and course contexts. Consent gating, validation, US formatting on blur, inline confirmation/cancel, hiding and restoring the form, phone clearing, active-call blocking, a readable cooldown error, and personalized Calls transcripts worked. The existing floating call notification named the guest when navigating away. Guest layout was checked at nominal widths of 1024, 1440, and 1920 pixels without horizontal overflow; the body font is 16 px, inputs 17 px, and primary action 19 px. All seven taskbar apps fit at 1024 px.

During this v3 check, `127.0.0.1:8765` was unreachable. Real mode correctly disabled Guest Call and explained the offline state. No real guest POST, call, session, settings write, or backend restart was attempted. The earlier v2 live checks below are historical evidence, not a claim that the backend was reachable during v3 verification. An authorized real-phone test with Jay present and actual Windows execution remain outstanding. The API has no separate phone-answer event, so Calling reflects reported call activity rather than proof that someone answered.

Mock screenshots, with empty phone fields: [Guest form](./screenshots/v3-guest-form.png), [Calling](./screenshots/v3-guest-calling.png), and [Personalized transcript](./screenshots/v3-guest-transcript.png).

### Prior v2 verification

The final v2 source passed **59/59 tests** with `npm test` and passed `npm run build`, on macOS using Node.js 26 and npm 11.12. The full approximately 100-second mock sequence was also repeated in the browser through nudge, callback, final text, and session completion; its final console had no warnings or errors. The [handoff](./CLAUDE_HANDOFF.md#verification-record) distinguishes current v2 evidence from historical pre-v2 checks.

Current mock browser checks covered all six settings, both ladder timings (10/25/45 seconds and 120/300/300 seconds), idle camera preview, disabled screen/camera states, and active TikTok/phone-in-hand verdicts with method and timing. Minimizing Eyes removed its image; restoring it resumed the preview. Log filtering, pause/resume, and clear-view followed by new entries worked. Eyes, Log, and Control Panel were checked at 1024, 1440, and 1920 px; the 1024 px Eyes panes stack, all six taskbar entries fit, and no horizontal overflow was observed at 1024 or 1920 px. All three classic themes and the Style room were checked again.

The user’s running real API was also checked while its session stayed idle. State, settings, logs, and a 640x360 JPEG camera preview loaded. All six setting changes were acknowledged through the UI, then the exact original settings were restored and verified. Screen-off disabled Screenshot second look while idle camera preview continued; camera-off removed the image. No real session, call, text, or active escalation was triggered. No real photos were saved, and no backend files or processes were changed.

Screenshots contain mock data only: [Eyes](./screenshots/v2-eyes.png), [Log](./screenshots/v2-log.png), [Control Panel](./screenshots/v2-controls.png), and [Eyes at 1024 px](./screenshots/v2-eyes-1024.png).

Unavailable hardware, module errors, missing-photo 404s, request cancellation, and source isolation have automated coverage. Actual Windows execution, backend-restart persistence, real active screen/camera judgment, live escalation, iMessage delivery, phone calls, and live Canvas access remain unverified. Recovery from a previously connected real backend is covered by poller tests rather than a browser restart/recovery exercise.

Trello and Google Calendar remain placeholders. The scan animation is schedule-derived, and the supplied call fixture intentionally keeps its original duration/wording despite shorter demo timing. Initial real event history remains limited to the API’s latest 200 events. There is no deployment configuration, and no commit or push was made.
