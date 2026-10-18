# Mom.exe — Family Computer edition

The selected Mom.exe interface is **Family Computer**, a retro desktop with teal wallpaper, beveled windows, a taskbar, and a Mom call-status window. It is the default dashboard at `/`. It uses the existing real/mock API contract and provides the full Today, Tasks, Calls, and Settings flows.

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
- Open Settings for the API source, read-only thresholds, confirmed Test call, and collapsed Demo controls.
- Use window controls to minimize or enlarge a window, and the taskbar or navigation to restore it. Minimizing a window does not stop the session or polling.
- Mom Messenger reflects actual events. The taskbar and health indicators reflect the active API source.

The call window is a status display. **Answer the actual call on your phone.** The API has no browser answer or hangup endpoint. The original Style room's simulated answer button is a design-study interaction, not a production capability.

Use a desktop browser at 1280–1920 pixels wide for the demo; the interface must remain usable at 1024 pixels. Fonts load from Google Fonts, with local fallbacks when offline.

## Run the scripted mock demo

1. Open `/?mock=1` and start a session with a future deadline, for example a task with a **30 min** duration.
2. Let the sequence run without interrupting it. The default sequence takes about **100 seconds**:

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

Mock sessions, events, statistics, and tasks live in memory and reset on a full reload. API-source and classic-theme preferences persist in local storage. Sample deadlines are relative to mock initialization.

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
| `POST /api/session/start` | `{ text }` from free text or `{ goal, until }` from a task. |
| `POST /api/session/stop` | `{}` after inline confirmation. |
| `POST /api/not-distracted` | `{}` to accept the current app for this session. |
| `POST /api/test-call` | `{}` after inline confirmation. |
| `POST /api/demo/force-distracted` | `{ distraction, seconds }`. |

System Status shows `imessage`, `detector`, `calls`, and `webcam`, with any supplied health message displayed inline. The classic dashboard offers those details on hover or keyboard focus. When the API becomes unreachable, the dashboard preserves the last successful snapshot, shows a banner, and retries automatically.

An explicit `?mock=0` or `?mock=1` takes precedence over the saved Settings value and `VITE_USE_MOCK=1`. The Settings toggle updates both the URL and local preference. Use only non-sensitive frontend configuration; never put credentials or contact details in `web/`.

## Check and build

Run from `web`:

```text
npm test
npm run build
```

The test suite covers the API command contract, deterministic mock transitions, polling behavior, desktop window state, and Messenger event selection. The build checks TypeScript and creates `web/dist` with the dashboard and Style room entries.

To preview compiled output, stop your development server first, then run:

```text
npm run preview
```

Open `/?mock=1` for a standalone preview. Use `npm run dev` for Python integration; do not assume the production-preview server provides the development API proxy.

## Verification and remaining work

The final Family Computer source passed **22/22 tests** with `npm test` and passed `npm run build`. Native-browser checks exercised the full approximately 100-second mock sequence, session validation/start/trust/confirmed stop, timed and Until due task starts, Messenger events, call transcripts, timeline search, window controls, keyboard menu access, and mock demo commands. The classic theme switcher and Style room also loaded successfully.

No horizontal overflow was observed at 1440 px, in the 1024 px Today/Tasks/Settings views, or in Today and Tasks at 1920 px. The final mock browser run had no console warnings or errors. See the [handoff verification record](./CLAUDE_HANDOFF.md#verification-record) for precise coverage and screenshots.

Switching from mock to the unavailable real API showed an offline banner without retaining mock data; Use mock demo recovered the interface. Recovery from a previously connected real backend is covered by poller tests, not a live browser integration run. API request failures during the earlier offline check were expected and are separate from the clean final mock run.

Actual Windows execution, real calls, iMessage delivery, live screen detection, and live Canvas access remain unverified. The API configured on port 8765 was unreachable during the integration check, and no backend files or processes were changed. The API integration follows the documented contract; mock success does not verify external services. Initial real event history is limited to what the API returns for `after=0` (the latest 200 events). The application retains subsequent events during the current page session.

Trello and Google Calendar remain placeholders. The original call fixture and shortened mock timing differ intentionally, as explained above. There is no deployment configuration; this is a local desktop dashboard. No commit or push was made.
