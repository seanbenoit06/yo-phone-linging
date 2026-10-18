# Mom.exe: guide for agent sessions

An AI agent that phone-calls you when you procrastinate.

## Architecture (decided 2026-10-17)

- **`main.py` is the app.** It reads iMessages (`texter.py`, `intent.py`), watches the screen
  (`detector.py`) and optionally the webcam (`webcam.py`), and lets `brain.py` decide when Mom texts,
  calls (`caller.py`), calls back, or snitches. Modules, owners and contracts: **[INTERFACES.md](INTERFACES.md)**.
- **`mom/` is the trigger framework**, where the calendar feature is built. Each trigger decides
  *when* Mom calls and *why*. Calendar triggers get wired into `main.py` once they fire.
- The screen feature is already implemented by `detector.py` + `brain.py`, not `mom/triggers/screen.py`.
- `common.py` only re-exports `mom/config.py` + `mom/elevenlabs.py`, so there is one implementation.

## Run the whole app (start here)

1. Python: `uv venv`, activate it (`source .venv/bin/activate`, Windows: `.venv\Scripts\Activate.ps1`),
   `uv pip install -r requirements.txt` (`-r requirements-dev.txt` for tests).
2. `.env`: `cp .env.example .env` and fill it in (each key has a comment). A teammate can send a filled
   `.env` privately; then change `MY_PHONE_NUMBER` and `USER_NAME` to your own. Never commit or paste it.

   | Needed for | Keys / files |
   |---|---|
   | Calls | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `MY_PHONE_NUMBER`, `USER_NAME` |
   | iMessage | `PHOTON_PROJECT_ID`, `PHOTON_API_KEY` (your number must be assigned to the Photon shared line) |
   | Screen + webcam judging | `GEMINI_API_KEY` |
   | Tasks | `CANVAS_SESSION_COOKIE` (expires; copy it again), `TRELLO_*`, Google `credentials.json` + `python -m mom.calendar.gcal` once (saves `token.json`) |
   | Switches | `DEMO_MODE`, `DETECTOR_VISION`, `DETECTOR_MODE`, `USE_WEBCAM`, `FRIEND_PHONE_NUMBER`, `CALENDAR_IDS` |

3. Terminal 1: `python main.py` (the app, plus the dashboard API on `127.0.0.1:8765`).
4. Terminal 2: `cd web && npm install && npm run dev` → `http://localhost:3000/?mock=0`
   (`?mock=1` plays a scripted demo without the Python app).
5. Start a session in the dashboard (`MATH 208 homework until 11 PM`) or by iMessage. With `DEMO_MODE=1`:
   distracted 10 s → "?" text, 25 s → call, callback 45 s after a promise.

**Real side effects.** A session texts and calls `MY_PHONE_NUMBER`; **Test call** rings it right away;
calls cost about $0.10 per minute. Agent sessions: ask the user before anything that texts or calls.

**Windows.** Calls, iMessage, the dashboard, tasks and calendar work. `detector.py` (osascript) and
`webcam.py` (ffmpeg avfoundation) are macOS-only: on Windows the detector returns no activity, so keep
`USE_WEBCAM=0` and drive the ladder with **Settings → Demo controls → Force distracted**.

**Before pushing.** `python -m pytest -q tests`, `cd web && npm test && npm run build`. `.env`,
`credentials.json` and `token.json` are git-ignored; stage files by name, never `git add -A`.
What's done and what's next: `PLAN.md`.

## First: figure out which feature you're working on

| Feature | Owned files | Doc |
|---|---|---|
| Core loop, brain, calls | `main.py`, `brain.py`, `caller.py`, `models.py`, `settings.py`, `call_me.py` | `INTERFACES.md` |
| iMessage | `texter.py`, `intent.py` | `INTERFACES.md` |
| Off-task screen monitor | `detector.py` | `docs/features/screen.md` |
| Webcam | `webcam.py` | `INTERFACES.md` |
| ElevenLabs agent prompt | `agent/` | `agent/SETUP.md` |
| Calendar meetings & deadlines | `mom/triggers/calendar.py`, `mom/calendar/` | `docs/features/calendar.md` |

If the user hasn't said which feature they own, ask before editing. Then:

1. Read your feature doc. It holds status, decisions and open questions.
2. **Only edit your feature's owned files** and its feature doc. Don't touch the other feature's files.
3. Changes to shared files are allowed only when your feature needs them. Keep them small,
   keep them backward compatible, and mention them explicitly in your summary/PR so the other owner can review.
4. Before ending a session, update your feature doc's **Status** and **Decisions** sections.

## Layout

```
main.py, brain.py, caller.py, models.py, settings.py   the app (see INTERFACES.md)
texter.py, intent.py, detector.py, webcam.py           app modules (see INTERFACES.md)
agent/                ElevenLabs prompt, opening lines, dashboard setup
common.py             re-exports mom/config.py + mom/elevenlabs.py
call_me.py            Manual test call: python call_me.py [--dry-run]
list_numbers.py       List ElevenLabs phone numbers / phone_number_id
mom/
  config.py           SHARED  load_config / optional_config / fail (.env)
  elevenlabs.py       SHARED  api_request + readable HTTP errors
  caller.py           SHARED  make_call(config, reason): place call, poll, print transcript
  state.py            SHARED  state/state.json: handled dedup keys, last call time
  run.py              SHARED  main loop: polls triggers, enforces rules, calls
  triggers/
    base.py           SHARED  CallReason + Trigger contract (change only with both owners' agreement)
    __init__.py       SHARED  registry: name → "module:Class" (add one line per new feature)
    screen.py         screen feature
    calendar.py       calendar feature
docs/features/        one doc per feature, owned by that feature
```

## Call flow in the trigger framework (`mom/`)

```
python -m mom.run
  └─ every --interval s, for each enabled trigger:
       reason = trigger.check(now)            # feature code: CallReason or None
       skip if None, dedup_key already handled, or global cooldown active
       state.record_call(reason)               # recorded first so failures aren't retried every loop
       caller.make_call(config, reason)
         ├─ agent = ELEVENLABS_AGENT_ID_<TRIGGER> or ELEVENLABS_AGENT_ID
         ├─ POST /v1/convai/sip-trunk/outbound-call   (ElevenLabs → Photon SIP → phone)
         │     dynamic_variables = {user_name, **reason.dynamic_variables}
         ├─ poll GET /v1/convai/conversations/{id} until done/failed
         └─ print transcript
```

`make_call` blocks until the call ends, so only one call happens at a time. A trigger whose
`check()` raises is logged and skipped; the other triggers keep running.

## The trigger contract (`mom/triggers/base.py`)

```python
class Trigger(Protocol):
    name: str                                         # matches the registry key
    def check(self, now: datetime) -> CallReason | None

@dataclass
class CallReason:
    trigger: str              # = name; also picks the ElevenLabs agent
    dedup_key: str            # Mom calls at most once per key, ever
    dynamic_variables: dict   # string values; become {{vars}} in the agent prompt
    summary: str = ""         # one line for logs
```

- `check()` runs every poll (default 60s). Keep it fast; cache API results inside the trigger if needed.
- Constructors take no arguments. Load your own settings with `load_config` / `optional_config`.
- Pick dedup keys so that a *new* situation gets a new key (include an event start time or a distraction session start).
- Triggers never place calls themselves and never sleep.

## ElevenLabs agents

The agent prompt lives in the ElevenLabs dashboard, not in git. Each feature uses its **own agent**
so prompt edits can't break the other feature:

- `ELEVENLABS_AGENT_ID`: default agent ("Asian Parents", used by `main.py` and `call_me.py`). Its First
  message is exactly `{{opening_line}}` and its prompt needs every variable from
  `caller.build_dynamic_variables()` (see the agent contract in `INTERFACES.md`).
  **`mom.caller.make_call()` with this agent fails with "Missing required dynamic variables"**,
  so triggers that use it must send those variables too, or use their own agent.
- `ELEVENLABS_AGENT_ID_SCREEN`, `ELEVENLABS_AGENT_ID_CALENDAR`: optional per-feature overrides

Document which `{{variables}}` your agent's prompt expects in your feature doc. ElevenLabs rejects
calls that are missing variables the prompt uses.

## Running and testing

```bash
python main.py                                           # the app (DEMO_MODE=1 in .env for demo timings)
python call_me.py --dry-run                              # print the variables a call would send
python -m mom.run --triggers calendar --dry-run --once   # one pass, prints instead of calling
python -m mom.run --triggers calendar --dry-run          # loop, prints instead of calling
python -m mom.run --triggers calendar                    # real calls
python call_me.py                                        # one real call, no trigger involved
```

Always develop with `--dry-run`. Real calls ring a real phone and cost ElevenLabs credits.
Delete `state/state.json` to forget past calls.

## Cross-platform (Windows + macOS)

The two owners develop on different OSes (Windows and macOS), so everything must run on both.

- Shared code stays pure Python: `pathlib` for paths, `encoding="utf-8"` on every file read/write,
  no shell commands, no OS-specific imports.
- OS-specific feature code (e.g. active-window detection) goes behind one function in the feature
  package, with one module per OS picked by `sys.platform` and imported lazily:
  `mom/screen/__init__.py` → `_windows.py` (`win32`) / `_macos.py` (`darwin`). Unsupported OS → a clear error, not a crash at import.
  Put per-OS dependencies in `requirements.txt` with environment markers, e.g. `pywin32; sys_platform == "win32"`.
- `mom/config.py` forces UTF-8 stdout/stderr (Windows otherwise crashes printing emoji to a redirected stream),
  and `mom/elevenlabs.py` uses `truststore` so HTTPS trusts the OS certificate store (the Windows dev
  machine has Norton TLS scanning). If you add another HTTP client, make sure it goes through `requests`
  or `ssl` after that import.
- No Docker: the screen monitor needs the host desktop, and calendar OAuth needs a host browser. `.python-version` + `uv` pin the environment instead.

## Conventions

- Python 3.10+ (3.12 pinned in `.python-version`). Plain functions and small classes, no frameworks. Dependencies are added to `requirements.txt` (only add lines).
- Errors the user will see are readable, with a ❌ message and a concrete next step (see `mom/elevenlabs.py`).
- Import OS-specific or heavy dependencies inside your feature package, never from shared modules,
  so the other feature still runs without them.
- Secrets live in `.env` (git-ignored). Add new keys with placeholder values to `.env.example`.
  OAuth files (`credentials.json`, `token.json`) and `state/` are git-ignored.
- Branches: `feat/screen-monitor`, `feat/calendar`. Small PRs into `main`; rebase on `main` often.
- Before pushing any code change: test a **real** phone call end to end (`python call_me.py`, plus your
  trigger without `--dry-run` once it can fire), and have the user confirm the phone rang.
  Then `git pull --rebase` and push.

## Adding a new feature later

1. `mom/triggers/<name>.py` with a class that has `name = "<name>"` and `check(now)`.
2. One line in `mom/triggers/__init__.py` `TRIGGERS`.
3. An ElevenLabs agent for it → `ELEVENLABS_AGENT_ID_<NAME>` in `.env.example`.
4. `docs/features/<name>.md` (copy an existing one) and a row in the table at the top of this file.
