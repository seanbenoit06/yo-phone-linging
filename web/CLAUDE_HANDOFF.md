# Claude Code handoff — Family Computer edition

## Selected direction

Jay selected **The Family Computer** from the Style room and asked for a fully prepared version before continuing in Claude Code. Preserve its teal desktop, beveled cream windows, blue title bars, taskbar, homework explorer, Mom Messenger, and distinctive call-status window. Keep the design readable on a projector: body text at least 16 px, large session and stage labels, and usable layouts from 1024 to 1920 px.

The functional Family Computer edition is the default at `/?mock=1`. This user decision supersedes `docs/UI_SPEC.md` where it calls for the original Flow default and sidebar layout. The API contract and behavioral requirements in the spec still apply. The old dashboard and all comparison studies remain available.

- Selected functional edition: `http://localhost:3000/?mock=1`
- Real API mode: `http://localhost:3000/?mock=0`
- Classic dashboard: `http://localhost:3000/?edition=classic&mock=1`
- Original concept: `http://localhost:3000/style-lab.html?concept=momOS`

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
| `src/desktop/windowState.ts` | Window-state reducer for Today, Tasks, Calls, Settings, taskbar restoration, and Messenger visibility. |
| `src/desktop/selectors.ts` | Selects the newest Messenger text events and presents them chronologically. |
| `src/desktop/StudyControl.tsx` | Functional session entry and controls with actual deadlines and command feedback. |
| `src/desktop/IncomingCall.tsx` | Honest phone-call status presentation; no browser answering. |
| `src/desktop/desktop.css` | Desktop layout, retro styling, responsive behavior, and scoped shared-component overrides. |
| `src/desktop/study.css` | Study Control and call-status presentation. |
| `src/api/ui.ts` | Shared API-source preference and server-aligned UI clock. |
| `src/api/types.ts` | Authoritative frontend TypeScript API interfaces. |
| `src/api/client.ts` | Real API implementation and React polling hooks. |
| `src/api/poller.ts` | Poll scheduling, event cursor, error retention, and source teardown behavior. |
| `src/api/mock.ts` | In-memory API with injectable clock and scripted demo. |
| `src/views/Tasks.tsx` | Task sources, grouping, links, and task-start flow. |
| `src/components/TaskStartPicker.tsx` | Duration selection and `{ goal, until }` command. |
| `src/views/Calls.tsx`, `src/components/CallTranscript.tsx` | Completed call history, promise/excuse, and transcript. |
| `src/views/Settings.tsx` | API source, thresholds, confirmed Test call, Demo controls, and configurable appearance content. |
| `src/components/Timeline.tsx` | Searchable event history and expandable call transcript. |
| `src/components/dashboard.tsx` | Shared ladder, activity, promise, stats, mood, and excuses components. |
| `src/themes/themes.ts`, `src/themes/tokens.css` | Original theme copy/tokens and centralized Chinese decorative accents. |
| `src/lab/`, `style-lab.html` | Preserved Family Portal, Mom's Little Corner, and Family Computer design studies. |
| `vite.config.ts` | Port 3000, development API proxy to port 8765, and dashboard/Style room build entries. |
| `tests/` | API, mock, polling, and any new focused behavior tests. |

Use the actual files as the source of truth if another session changes a name or interface after this document is written.

## Data flow and interaction rules

1. The URL/saved preference selects the mock or real `ApiClient`. Explicit `mock=0` or `mock=1` wins over saved defaults.
2. The mounted edition owns one `useDashboard(mock)` and one `useTasks(mock)` tree. Window navigation and minimization must not instantiate extra polling trees or reset the session.
3. State and incremental events poll every second. Tasks fetch initially and every 60 seconds. The poller retains last successful data on errors and ignores results from discarded sources.
4. The UI clock follows `State.now`. Deadlines, distraction duration, callback countdowns, and task labels derive from this clock.
5. Commands use the existing `ApiClient`, show pending/error feedback, and refresh after success. A source switch must not allow an old command's result to affect the newly selected source.
6. Desktop window controls are presentation state. Session progress comes only from the active API source.
7. Settings can supply edition-specific appearance content without duplicating real command controls. The classic dashboard keeps its three-theme picker.

### Commands

| Action | Endpoint/body |
| --- | --- |
| Tell Mom | `POST /api/session/start` with `{ "text": "..." }`. |
| Start with Mom | Same endpoint with `{ "goal": "context title", "until": "ISO timestamp" }`. |
| Done | `POST /api/session/stop` with `{}`, after inline confirmation. |
| I'm actually working | `POST /api/not-distracted` with `{}`. |
| Test call | `POST /api/test-call` with `{}`, after inline confirmation. |
| Force distracted | `POST /api/demo/force-distracted` with `{ "distraction": "TikTok", "seconds": 60 }`. |

**There is no answer-call or hangup endpoint.** A production call window reports the real `call_in_progress` state and directs the user to answer on their phone. Do not reuse the Style room's simulated answer callback to mutate real dashboard state. Do not add a fake answer button, guessed endpoint, microphone capture, or browser calling integration.

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

The standard sequence is approximately 100 seconds: watching at 0 s, distraction at 5 s, text at 15 s, nudge at 30 s, nudge ends at 45 s, callback starts at 90 s, and session ends at 100 s. These timings are relative to session start; the text/call thresholds are relative to distraction, and the callback delay starts when the nudge ends.

The provided nudge transcript retains its recorded 48-second duration while the visual mock call lasts about 15 seconds. Transcript wording about five minutes and follow-up wording about one minute remain the supplied fixture; the actual demo countdown is 45 seconds. This is an intentional fixture/timing distinction.

Mock tasks and synchronization status are samples. Their URLs are empty so Open is disabled. “This week” means the next seven calendar days. Missing/past deadlines disable Until due. Trello and Google Calendar stay as disabled coming-soon integrations.

## Verification record

The final Family Computer source passed `npm test` with **22/22 tests** and passed `npm run build`. Tests cover the real client's command paths and bodies, mock transitions and deadlines, poller overlap/error/source handling, desktop window state, and selection of the newest Messenger messages in chronological order.

The following were observed in the native Browser against the local frontend:

| Area | Observed result |
| --- | --- |
| Study Control | Idle parse-error feedback, session start, trust override, and inline-confirmed stop worked. Starting a new task after a confirmed stop cleared the old "Session finished" notice. |
| Tasks | Both a 30-minute start and Until due sent the selected task into a session and navigated to Today. |
| Scripted demo | The approximately 100-second mock sequence progressed through nudge call, callback, and session end. Messenger displayed the received text events. |
| Calls and activity | Call History displayed the supplied 48-second transcript fixture. Callback timeline search and transcript expansion worked. |
| Desktop controls | Minimize, taskbar restore, maximize, Messenger restoration, Mom Menu focus, and Escape handling worked. |
| Settings | Mock Test call and Force distracted worked with their expected UI controls. |
| API-source switching | Switching to the unavailable real API showed an offline banner and cleared mock data; Use mock demo restored the mock interface. |
| Preserved interfaces | All three classic themes switched successfully; the Style room passed a basic load check. |
| Layout | No horizontal overflow was observed at 1440 px; in Today, Tasks, and Settings at 1024 px; or in Today (idle and active) and Tasks at 1920x1080. The 1920 px screenshots were visually inspected. |
| Final mock console | No warnings or errors were reported in the final mock browser run after returning from the Style room. Earlier offline-test request failures are outside this result. |

Saved browser evidence:

- [Mock call notification](./screenshots/family-computer-call.png)
- [Call History and transcript](./screenshots/family-computer-calls.png)
- [Today at 1024 px](./screenshots/family-computer-1024.png)
- [Tasks at 1024 px](./screenshots/family-computer-tasks-1024.png)
- [Settings at 1024 px](./screenshots/family-computer-settings-1024.png)
- [Idle Today at 1920 px](./screenshots/family-computer-1920.png)
- [Active Today at 1920 px](./screenshots/family-computer-active-1920.png)

These checks have specific limits. Recovery from a previously connected real backend is covered by poller tests, not by a live browser integration run. The API configured on port 8765 was unreachable during the source-switch check. API request failures in that earlier offline check were expected and are separate from the clean final mock run. No backend files were modified and no backend process was started or restarted.

`git diff --check` passed. The root `.gitignore` changes contain only the two approved frontend-directory additions. No commit or push was made.

Actual Windows execution, real phone calls, iMessage delivery, live screen detection, and live Canvas access remain unverified. Trello and Google Calendar are still coming-soon placeholders. The API client is ready for contract-based integration, but external services require a coordinated live run.

## Backend integration work for Claude Code

1. Read the current Python API implementation without editing it. Compare payloads, nullability, timestamps, and command error shapes with `docs/UI_SPEC.md` and `src/api/types.ts`. Report mismatches to the backend owner rather than silently changing that session's files.
2. When the backend owner has started the API, use the Vite development server with `?mock=0` to inspect state, events, task sources, and offline/recovery behavior. Do not restart their process without coordination.
3. Check that real source errors, missing activity, missing deadlines, empty history, long goals/titles, and masked contact data render correctly. The frontend must never embed unmasked contact details.
4. With user authorization for real communications, verify one real call/text scenario through the backend. A mock run does not authorize or prove a real call. Keep browser call status observational.
5. Validate on Sean's Windows machine with the same npm commands. Record the actual Node/npm/browser versions and any platform-specific issue.
6. Refresh the verification record and screenshots after meaningful UI changes. Leave the chosen direction and comparison routes intact unless Jay asks to change them.

No backend connection, actual-call test, deployment, commit, or push is claimed in this handoff.

## Ready-to-paste continuation prompt

> Continue the Mom.exe Family Computer edition in `/Users/jay/Desktop/business/mom-exe` (use the equivalent checkout path on Windows). First read `~/.claude/CLAUDE.md`, applicable project instructions, `web/CLAUDE.md`, `docs/UI_SPEC.md`, `web/README.md`, and `web/CLAUDE_HANDOFF.md`, then inspect the current changes. Jay selected the Family Computer retro desktop as the default; preserve its visual direction, the classic dashboard, and the Style room. Work only inside `web/` and preserve other sessions' changes. Keep repository text in English and explain progress in Traditional Chinese. Verify the current implementation and finish any documented frontend gaps, then compare the existing API client with the backend contract read-only. Coordinate with the backend owner for live integration; do not invent browser answer/hangup endpoints or place real calls without authorization. Use mock mode for independent development. Run appropriate tests and the production build, check the real browser at 1024/1440/1920 px, and update the verification record with observed evidence. Never store secrets or phone numbers in `web/`, never use `git add -A`, and ask Jay before any push. Do not edit or restart the backend as part of this frontend task.
