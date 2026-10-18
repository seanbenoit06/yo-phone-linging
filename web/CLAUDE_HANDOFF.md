# Claude Code handoff — Family Computer edition

## Selected direction

Jay selected **The Family Computer** from the Style room and asked for a fully prepared version before continuing in Claude Code. Preserve its teal desktop, beveled cream windows, blue title bars, taskbar, homework explorer, Mom Messenger, and distinctive call-status window. Keep the design readable on a projector: body text at least 16 px, large session and stage labels, and usable layouts from 1024 to 1920 px.

The functional Family Computer edition is the default at `/?mock=1`. This user decision supersedes `docs/UI_SPEC.md` where it calls for the original Flow default and sidebar layout. The API contract and behavioral requirements in the spec still apply, including section 9 for monitoring and editable controls. The old dashboard and all comparison studies remain available.

- Selected functional edition: `http://localhost:3000/?mock=1`
- Real API mode: `http://localhost:3000/?mock=0`
- Classic dashboard: `http://localhost:3000/?edition=classic&mock=1`
- Original concept: `http://localhost:3000/style-lab.html?concept=momOS`

The Family Computer v2 edition adds Mom’s Eyes, Mom’s Log, and six editable monitoring settings. The classic dashboard intentionally retains its original read-only settings block and theme picker; the Style room is unchanged.

The production edition is API-wired. The Style room is a separate sample-state prototype; its scene controls and simulated call answer are not production API capabilities. `web/CLAUDE.md` is the frontend continuation entry point and directs future work to this handoff and the README.

## Working boundaries

- Read `~/.claude/CLAUDE.md`, applicable project instructions, and the complete `docs/UI_SPEC.md` before continuing.
- Edit only `web/`. The only allowed root `.gitignore` additions are `web/node_modules/` and `web/dist/`; they are already present.
- Other AI sessions work in this checkout. Inspect current changes and preserve work outside your ownership. Do not reset, revert, reformat, or stage their files.
- Keep repository code, comments, docs, and commit messages in English. Explain progress to Jay in Traditional Chinese, retaining technical keywords.
- Never place secrets, API credentials, passwords, or phone numbers in `web/`.
- Never run `git add -A`. Stage only explicit files in `web/` and the permitted `.gitignore` changes if a commit is requested.
- Ask Jay before any push. No push, commit, deployment, actual call, or backend restart is required for this handoff.
- Keep npm commands compatible with Windows and macOS.

## Source map

| File | Responsibility |
| --- | --- |
| `CLAUDE.md` | Frontend continuation entry point, selected direction, and working boundaries. |
| `src/App.tsx` | Edition entry point; selected desktop by default, classic via `edition=classic`. |
| `src/ClassicDashboard.tsx` | Preserved original dashboard and three switchable themes. |
| `src/desktop/FamilyComputer.tsx` | Functional desktop shell, one dashboard/tasks polling tree, window navigation, real data wiring, and edition links. |
| `src/desktop/DesktopWindow.tsx` | Shared window chrome and minimize/maximize presentation. |
| `src/desktop/windowState.ts` | Window-state reducer for Today, Tasks, Calls, Eyes, Log, Settings, taskbar restoration, and Messenger visibility. |
| `src/desktop/selectors.ts` | Selects the newest Messenger text events and presents them chronologically. |
| `src/desktop/StudyControl.tsx` | Functional session entry and controls with actual deadlines and command feedback. |
| `src/desktop/IncomingCall.tsx` | Honest phone-call status presentation; no browser answering. |
| `src/desktop/MomEyes.tsx`, `eyes.css` | Screen/camera panes, module states, live readouts, and retro monitor/TV presentation. |
| `src/desktop/eyesModel.ts` | Pure monitoring-state precedence, host-only URL display, method labels, timing, and displayed-photo age. |
| `src/desktop/photoFeed.ts` | Three-second photo requests, abort/generation handling, and image object-URL lifecycle. |
| `src/desktop/MomLog.tsx`, `log.css` | Command Prompt log view, source filter, scrolling controls, and clear-view action. |
| `src/desktop/ControlSettings.tsx`, `controls.css` | Six editable monitoring controls with inline saving/saved/error feedback and capability reasons. |
| `src/desktop/desktop.css` | Desktop layout, retro styling, responsive behavior, and scoped shared-component overrides. |
| `src/desktop/study.css` | Study Control and call-status presentation. |
| `src/api/ui.ts` | Shared API-source preference and server-aligned UI clock. |
| `src/api/types.ts` | Authoritative frontend TypeScript API interfaces. |
| `src/api/client.ts` | Real API implementation and React polling hooks. |
| `src/api/poller.ts` | Poll scheduling, event cursor, error retention, and source teardown behavior. |
| `src/api/settings.ts` | Settings controller/hook, authoritative refresh, write serialization, acknowledgement guards, and source isolation. |
| `src/api/logs.ts` | Incremental log cursor, bounded buffer, clear-view semantics, and one-second polling. |
| `src/api/mock.ts` | In-memory API with injectable clock and scripted demo. |
| `src/views/Tasks.tsx` | Task sources, grouping, links, and task-start flow. |
| `src/components/TaskStartPicker.tsx` | Duration selection and `{ goal, until }` command. |
| `src/views/Calls.tsx`, `src/components/CallTranscript.tsx` | Completed call history, promise/excuse, and transcript. |
| `src/views/Settings.tsx` | Shared API source, confirmed Test call, Demo controls, and optional appearance/controls slots; classic defaults remain intact. |
| `src/components/Timeline.tsx` | Searchable event history and expandable call transcript. |
| `src/components/dashboard.tsx` | Shared ladder, activity, promise, stats, mood, and excuses components. |
| `src/themes/themes.ts`, `src/themes/tokens.css` | Original theme copy/tokens and centralized Chinese decorative accents. |
| `src/lab/`, `style-lab.html` | Preserved Family Portal, Mom's Little Corner, and Family Computer design studies. |
| `vite.config.ts` | Port 3000, development API proxy to port 8765, and dashboard/Style room build entries. |
| `tests/` | API, mock, poller, settings concurrency, monitoring-state, photo-lifecycle, log-buffer, and desktop behavior tests. |

Use the actual files as the source of truth if another session changes a name or interface after this document is written.

## Data flow and interaction rules

1. The URL/saved preference selects the mock or real `ApiClient`. Explicit `mock=0` or `mock=1` wins over saved defaults.
2. The mounted edition owns one `useDashboard(mock)` and one `useTasks(mock)` tree. Window navigation and minimization must not instantiate extra polling trees or reset the session.
3. State and incremental events poll every second. Tasks fetch initially and every 60 seconds. The poller retains last successful data on errors and ignores results from discarded sources.
4. The UI clock follows `State.now`. Deadlines, distraction duration, callback countdowns, and task labels derive from this clock.
5. Commands use the existing `ApiClient`, show pending/error feedback, and refresh after success. A source switch must not allow an old command's result to affect the newly selected source.
6. Desktop window controls are presentation state. Session progress comes only from the active API source.
7. Family Computer creates one `useSettings(api, state, refresh)` controller. `Settings` receives the `ControlSettings` component through its optional controls slot; classic retains its three-theme picker and read-only block.
8. Authoritative `GET /api/settings` runs initially and every 10 seconds. Initial failures retry every five seconds. Background reads refresh capabilities and unavailable reasons without disabling loaded controls. Only one write runs at a time; reads skip pending saves and a newer write invalidates an older read. Acknowledged values are protected from stale state polls until state catches up or a newer authoritative settings read replaces them. This also converges when another client changes the same field again.
9. `MomLog` starts one `useLogs(api)` poller when opened. It continues while its mounted window is hidden, uses the greatest received ID as cursor, deduplicates, and retains the newest 1,000 lines. Clear view discards the local view without replaying old history; pause only stops scrolling. Resetting the desktop layout can unmount the window and dispose its poller.
10. Eyes receives an explicit active-window flag because hidden desktop windows remain mounted. Photo requests run every three seconds only with an active/visible window and available/enabled camera. Hide, source change, camera-off, and teardown abort requests and revoke object URLs. The backend idle-preview lease can last 10 seconds after the last photo request. No screenshot or camera-photo files are written by the frontend.
11. The displayed image age uses its download time; the latest server `photo_at` is shown separately. A stale displayed image therefore does not inherit a newer server timestamp. The scanning animation is inferred from the check schedule; `monitor.screen.active` means an enabled session, not a separate in-flight request flag.

### Commands

| Action | Endpoint/body |
| --- | --- |
| Tell Mom | `POST /api/session/start` with `{ "text": "..." }`. |
| Start with Mom | Same endpoint with `{ "goal": "context title", "until": "ISO timestamp" }`. |
| Done | `POST /api/session/stop` with `{}`, after inline confirmation. |
| I'm actually working | `POST /api/not-distracted` with `{}`. |
| Test call | `POST /api/test-call` with `{}`, after inline confirmation. |
| Force distracted | `POST /api/demo/force-distracted` with `{ "distraction": "TikTok", "seconds": 60 }`. |
| Change monitoring setting | `POST /api/settings` with one changed field; accepts the full acknowledged `SettingsResponse`. |

**There is no answer-call or hangup endpoint.** A production call window reports the real `call_in_progress` state and directs the user to answer on their phone. Do not reuse the Style room's simulated answer callback to mutate real dashboard state. Do not add a fake answer button, guessed endpoint, microphone capture, or browser calling integration.

`State` includes `settings` and `monitor`. Hardware availability and unavailable reasons come from `GET /api/settings`, not from `State`. The additional reads are `GET /api/webcam/photo?t={timestamp}` (binary image; 404 means no photo) and `GET /api/logs?after={id}` (oldest-first incremental entries). Photo fetches use no-store behavior and generated SVG imagery in mock mode; never commit real camera imagery.

Display all six stages correctly: `idle`, `watching`, `distracted`, `texted`, `calling`, and `waiting_callback`. Callback calls use `call_type: "callback"`; snitch is shown only when supported by received events. Render the shared Ladder only with a non-null session.

## Run locally

Use Node.js `^22.12.0 || >=24.0.0` with npm. From the repository root, run each command separately:

```text
cd web
npm install
npm run dev
```

Then open `http://localhost:3000/?mock=1`. Keep the terminal running. Stop only the server you started, using Ctrl+C in that terminal. Do not open the HTML file directly.

To check the frontend:

```text
npm test
npm run build
```

To inspect the compiled app, stop your dev server and run `npm run preview`, then open the mock URL. Use the development server for Python integration; the preview server is not the documented API-proxy workflow.

## Mock-demo behavior

With Screen monitoring and Demo timing enabled, the standard sequence is approximately 100 seconds: watching at 0 s, distraction at 5 s, text at 15 s, nudge at 30 s, nudge ends at 45 s, callback starts at 90 s, and session ends at 100 s. These timings are relative to session start; the text/call thresholds are relative to distraction, and the callback delay starts when the nudge ends.

The provided nudge transcript retains its recorded 48-second duration while the visual mock call lasts about 15 seconds. Transcript wording about five minutes and follow-up wording about one minute remain the supplied fixture; the actual demo countdown is 45 seconds. This is an intentional fixture/timing distinction.

Mock settings, monitor checks, generated camera imagery, and log messages share the same in-memory API and scripted transitions. Switching Demo timing changes the ladder between 10/25/45 and 120/300/300 seconds. Mock settings reset on reload; restart persistence is a backend responsibility.

Mock tasks and synchronization status are samples. Their URLs are empty so Open is disabled. “This week” means the next seven calendar days. Missing/past deadlines disable Until due. Trello and Google Calendar stay as disabled coming-soon integrations.

## Verification record

### Current v2 checks

The final v2 source passed `npm test` with **59/59 tests** and passed `npm run build` on macOS with Node.js 26 and npm 11.12. Automated coverage includes API paths/bodies, settings validation and concurrency, authoritative refresh after external changes, log cursors and buffers, unavailable/error monitoring states, photo 404/cancellation/object-URL cleanup, source isolation, and the existing scripted demo/window behavior.

The following v2 checks were observed in the native Browser:

| Area | Observed result |
| --- | --- |
| Mock controls | All six settings changed and were restored. Demo timing showed 10/25/45-second thresholds; normal timing showed 120/300/300 seconds. |
| Mock Eyes | Idle camera preview, Screen paused, Camera off, and active TikTok/Phone in hand states rendered with method and timing. Minimizing Eyes left zero displayed images; restoring it returned one preview image. |
| Mock Log | Source filtering, pause/resume scrolling, and Clear view worked; newly received entries appeared after clearing. |
| Layout | Eyes, Log, and Control Panel were checked at 1024, 1440, and 1920 px. The 1024 px Eyes panes stack and all six taskbar entries fit; no horizontal overflow was observed at 1024 or 1920 px. The three 1440 px views were visually checked. |
| Complete mock regression | The approximately 100-second browser run completed through nudge, callback start/answer, final text, and session completion, with the matching entries visible in Mom’s Log. The final browser console had no warnings or errors. |
| Preserved interfaces | All three classic themes were selected and checked again; the Style room loaded its heading. |
| Real API reads | The user’s existing running backend supplied settings, state, and logs while its session remained idle. The log showed 26 entries from `main` and `api`. |
| Real settings writes | All six controls received acknowledgements. Screen-off disabled Screenshot second look while idle camera preview continued. Camera-off removed the displayed image. |
| Real camera preview | A 640x360 JPEG loaded through a memory-backed blob URL, with the latest server photo reported as 0 seconds old. No camera photo was saved to a file. |
| Real restoration | The exact original settings below were restored and verified by GET equality. The real session was still idle. |

Restored real settings:

```json
{
  "screen_monitoring": true,
  "screenshots": true,
  "webcam": true,
  "detector_mode": "lockin",
  "detector_llm": "gemini",
  "demo_mode": true
}
```

Current saved screenshots contain **mock data only**:

- [Mom’s Eyes](./screenshots/v2-eyes.png)
- [Mom’s Log](./screenshots/v2-log.png)
- [Editable Control Panel](./screenshots/v2-controls.png)
- [Stacked Eyes panes at 1024 px](./screenshots/v2-eyes-1024.png)

### Historical pre-v2 checks

Before the monitoring extension, the Family Computer edition passed 22 tests and a production build. Native-browser checks covered the approximately 100-second mock sequence through nudge/callback/end, session validation/start/trust/confirmed stop, task starts using 30 minutes and Until due, Messenger events, transcripts/search, minimize/restore/maximize, menu focus/Escape, mock Test call/Force distracted, and classic theme/Style room smoke checks. Those results are historical and are not a claim that every flow was repeated during the current v2 browser run.

The earlier real-source check encountered an unavailable API and verified the offline banner, cleared mock state, and return to mock mode. That is also historical: the backend was available for the current v2 idle integration described above.

### Limits

No real session, call, text, or active escalation was triggered for v2 verification. No backend files were modified, and no backend process was started or restarted. Actual Windows execution, backend-restart persistence, real active screen/camera judgment, live escalation, iMessage delivery, phone calls, and live Canvas access remain unverified. Recovery from a previously connected real backend is covered by poller tests, not a browser restart/recovery exercise. Hardware-unavailable, module-error, and missing-photo cases have automated coverage rather than a real-hardware browser fault exercise.

The screen scanning animation is schedule-derived because the contract has no in-flight-check flag. Camera download age and server photo age remain separate. Trello and Google Calendar are still placeholders. No deployment, commit, or push was made.

## Remaining integration work for Claude Code

1. Read the latest Python API implementation without editing it and compare changes against `docs/UI_SPEC.md` sections 4 and 9. Preserve the already working idle reads/settings/photo/log integration; report contract drift to the backend owner.
2. Validate on Sean’s Windows machine using the same npm commands. Record actual Node/npm/browser versions, platform availability flags, and their displayed reasons.
3. Coordinate a backend restart test with its owner to confirm settings persist. Restore the original configuration afterward. Do not restart another session’s process independently.
4. Only with explicit authorization for real communications, run an active session that exercises screen/camera judgment and escalation. The completed idle controls/preview check did not place calls or send messages and does not authorize them. Keep browser call status observational; no answer/hangup API exists.
5. Exercise live reconnect/recovery and hardware errors with the backend owner when appropriate. Current tests cover these logic paths, but a real-process recovery run has not been performed.
6. Refresh screenshots using mock imagery only, and update this verification record after meaningful changes. Preserve the selected Family Computer direction, classic themes, and Style room unless Jay requests otherwise.

## Ready-to-paste continuation prompt

> Continue Mom.exe Family Computer v2 in `/Users/jay/Desktop/business/mom-exe` (use the equivalent checkout path on Windows). Read `~/.claude/CLAUDE.md`, applicable project instructions, `web/CLAUDE.md`, all of `docs/UI_SPEC.md` including section 9, `web/README.md`, and `web/CLAUDE_HANDOFF.md`, then inspect current changes. Preserve the selected retro desktop, Mom’s Eyes, Mom’s Log, editable Control Panel, classic dashboard, and Style room. Work only inside `web/`; other sessions own the backend. Keep repository text in English and explain progress in Traditional Chinese. The current source passed 59 tests and a production build; idle real-API settings/log/photo integration was checked and original settings restored. Focus on the documented remaining gaps, especially Windows and coordinated persistence/live-judgment checks, without claiming that mock results prove real services. Keep one dashboard polling tree, serialized settings writes with authoritative refresh, cursor-based logs, and photo requests limited to a visible Eyes window. Never save real photos, secrets, or phone numbers in the repo. Do not invent browser answer/hangup endpoints or trigger real communications without explicit authorization. Do not edit or restart the backend independently. Run appropriate tests/build/browser checks after changes and update the evidence accurately. Never use `git add -A`, and ask Jay before any push.
