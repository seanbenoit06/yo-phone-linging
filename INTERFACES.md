# Interfaces

How the modules fit together, and who owns what. Several sessions build this in parallel,
so **only edit the files you own** and talk to other modules only through the types in `models.py`.

## Flow

```
            iMessage (Photon shared line)                     screen / webcam
                     │                                              │
   texter.poll_inbound() → intent.parse()            detector.get_activity() → detector.classify()
                     │                               webcam.check()  (optional, USE_WEBCAM=1)
                     ▼                                              ▼
                brain.on_text()                              brain.on_verdict()
                     │          brain.on_tick()   brain.on_call_ended()
                     └──────────────┬───────────────────────┘
                                    ▼
                     [SendText | PlaceCall]  (actions)
                                    │
                main.py: texter.send_text()  /  caller.call() in a thread
```

`main.py` is the only place with a loop, threads, or the clock. `brain.py` is pure logic.

## Owners

| File | Owner | What it does |
|---|---|---|
| `models.py` | core | Shared types. Ask before changing. |
| `settings.py` | core | Ladder timings; `DEMO_MODE=1` shrinks them for the demo. |
| `caller.py` | core | Place an ElevenLabs outbound call and wait for the `CallResult`. |
| `brain.py` | core | Escalation state machine. |
| `main.py` | core | The loop that wires everything together. |
| `call_me.py`, `list_numbers.py`, `common.py` | core | CLI tools and shared HTTP / `.env` helpers. |
| `texter.py`, `intent.py` | iMessage session | Send / receive iMessages, parse the user's texts. |
| `detector.py` | detector session | Read the active window / tab, decide on-task vs distracted. |
| `webcam.py` | webcam session | Phone-in-hand detection with Gemini (`USE_WEBCAM=1`, macOS). `main.py` runs it in a background thread. |
| `agent/` | agent-prompt session | ElevenLabs agent prompt, first message, dashboard setup. |
| `tasks/` | canvas session | Task sources (`tasks/canvas.py` now; Trello / Calendar later) → `list[Task]`. |
| `web/` | Codex | Local dashboard (React + Vite). Spec and API contract: `docs/UI_SPEC.md`. |
| `api.py` | core | Local HTTP API for the dashboard (`127.0.0.1:8765`), served from `main.py`. |
| `controls.py` | core | Runtime settings from the dashboard's Control Panel, saved in `state/settings.json`. |

## Contracts

```python
# texter.py
send_text(text: str) -> None                         # iMessage to MY_PHONE_NUMBER; raise on failure
poll_inbound() -> list[InboundText]                  # new user messages, oldest first, each exactly once

# intent.py
parse(text: str, now: datetime) -> Intent            # START_SESSION / NOT_DISTRACTED / STOP_SESSION / OTHER

# detector.py
get_activity() -> Activity | None                    # None if macOS permissions are missing
classify(activity: Activity, goal: str) -> Verdict   # < 5s, never raises (UNSURE on error)

# webcam.py
check() -> Verdict                                   # DISTRACTED + distraction="your phone" when phone in hand

# tasks/__init__.py
get_tasks() -> tuple[list[Task], dict[str, dict]]    # (tasks sorted by due_at, {"canvas": {"status", "synced_at", "message"}})
                                                     # cached ~5 min, never raises; a broken source → status "error"

# caller.py
build_dynamic_variables(user_name, goal, distraction, minutes_distracted,
                        call_type, last_promise, past_excuses) -> dict[str, str]
call(config, to_number, call_type, variables) -> CallResult   # blocks until the call ends

# brain.py — every handler returns list[SendText | PlaceCall]
Brain.on_text(intent, now) / on_verdict(activity, verdict, now) / on_call_ended(result, now) / on_tick(now)
```

`main.py` catches and logs any exception from these, so a broken module never stops the loop.
Each module should still be runnable on its own (`python detector.py ...`) for manual testing.

### `api.py` (dashboard API)

- **Guest call** (`POST /api/guest-call`, UI_SPEC section 10): a judge's own name, number and class; one voice call, never texts, never touches the brain (like Test call). Needs `consent: true`; 409 during a call, 429 within 60 s. The number is added to the response redaction list and is never logged.

`python main.py` serves the API from `docs/UI_SPEC.md` section 4 on `http://127.0.0.1:8765`
(`API_PORT` in `.env` to change it). Standard library only (`ThreadingHTTPServer`).

- **Threads**: the HTTP threads never touch the brain. `main.py` publishes a state snapshot every
  loop step (`DashboardApi.publish`) and records timeline events (`DashboardApi.record`, last 500,
  ids seeded from the clock so they keep increasing across restarts). `GET /api/state` and
  `GET /api/events` only read those. `GET /api/tasks` calls `tasks.get_tasks()` directly.
- **Commands** (`POST /api/...`) are validated in `api.py`, queued, and run by `main.py` at the start
  of its next step (`MomLoop.handle_command`); the request waits up to 6 s for the reply.
  Session start / stop / not-distracted become an `Intent` and go through `brain.on_text`, like an
  iMessage. `test-call` builds a nudge `PlaceCall` and goes through `execute()`; its result is
  **not** fed to the brain, so a test call never schedules a callback or a snitch call.
- **Safety**: binds to `127.0.0.1`; rejects a non-local `Host` or `Origin` (403), so other websites
  can't place calls; CORS for local origins (`http://localhost:3000`). Phone numbers and `*_API_KEY` values are
  masked in every response.
- **v2 (`docs/UI_SPEC.md` section 9)**: `GET/POST /api/settings` (POST goes through the command queue and
  `controls.update`), `GET /api/logs?after=` (every `main.log()` line, last 1000, redacted),
  `GET /api/webcam/photo` (latest JPEG from memory; each request keeps the no-Gemini camera preview running
  for 10 s), and `settings` + `monitor` in `GET /api/state`.

### `controls.py` (runtime settings)

```python
load(webcam_available, webcam_reason)   # main.py, once: .env defaults, then state/settings.json on top
get() -> dict                           # screen_monitoring, screenshots, webcam, detector_mode, detector_llm, demo_mode
info() -> dict                          # SettingsResponse: settings, available, unavailable_reason
update(changes) -> dict                 # validate, apply, save to state/settings.json; raises SettingsError
screen_enabled() / webcam_enabled()     # the setting AND this computer can do it
```

Applying sets `DETECTOR_VISION` / `DETECTOR_MODE` / `DETECTOR_LLM` in `os.environ` (detector.py reads them per call)
and calls `settings.apply_demo_mode()`, so always read `settings.X` at call time.
`webcam.py` keeps only the latest photo in memory (`latest_photo()`, `snapshot()`, `forget_photo()`); nothing is written to disk.

## ElevenLabs agent contract

Dynamic variables sent on **every** call (missing values are sent as `"none"`):

| Variable | Example |
|---|---|
| `user_name` | `Jay` |
| `goal` | `CSE homework` |
| `distraction` | `TikTok` |
| `minutes_distracted` | `5` |
| `call_type` | `nudge` / `callback` / `snitch` |
| `last_promise` | `open the hw PDF and read Q1` |
| `past_excuses` | `I'm too tired; just five minutes` |
| `opening_line` | Mom's first sentence, picked per `call_type` from `agent/opening_lines.json` (`{name}` placeholders). The dashboard First message is exactly `{{opening_line}}`. A callback with no `last_promise` uses the `nudge` line. |

Data Collection fields `caller.to_call_result()` reads after each call (exact names):

| Field | Meaning |
|---|---|
| `promised_step` | The one 5-minute step the user promised |
| `excuse` | The excuse the user gave |

## Escalation ladder (`settings.py`)

| Step | Real | `DEMO_MODE=1` |
|---|---|---|
| Distracted → check-in iMessage | 2 min | 10 s |
| Distracted → nudge call | 5 min | 25 s |
| Promise made → callback call | 5 min | 45 s |
| Answered call → no new distraction streak for | 1 min | 20 s |
| Ignored calls before calling `FRIEND_PHONE_NUMBER` | 1 | 1 |

## Working in parallel

- New env vars → append to `.env.example` with a `your_...` placeholder. Real values only in `.env`.
- New packages → append to `requirements.txt`, install with `uv pip install -r requirements.txt`.
- Commit only your own files (`git add <files>`, never `git add -A`).
