# Feature: screen (off-task monitor)

Mom calls when you've been distracted for too long (active app / website isn't what you should be doing).

**Implemented in the app, not as a `mom/` trigger:** `detector.py` decides on-task vs distracted,
`brain.py` tracks the distraction time and runs the escalation ladder, `main.py` wires them up.
The `mom/triggers/screen.py` stub stays unused. See `INTERFACES.md`.

- Feature code: `detector.py` (macOS: `osascript` for the frontmost app and the browser tab)
- Agent: the default agent (`ELEVENLABS_AGENT_ID`), set up per `agent/SETUP.md`
- Run: `python detector.py "CSE homework"` (detector alone) or `python main.py` (whole app)

## Status

- [x] Detect the active app / window title and browser tab (macOS; Windows not supported yet)
- [x] Classify distracted vs. on task (rules first, then Gemini / Jev, per-title cache)
- [x] Track continuous distraction time; text at 2 min, call at 5 min (`settings.py`, `DEMO_MODE`)
- [x] Real `minutes_distracted` from `brain.py`
- [x] Tested with a real call (`call_me.py`); end-to-end `main.py` run still pending

## Agent prompt variables

| Variable | Example | Meaning |
|---|---|---|
| `user_name` | `Jay` | added automatically by the caller |
| `goal` | `CSE homework` | what you should be doing |
| `distraction` | `TikTok` | what you're doing instead |
| `minutes_distracted` | `12` | how long, as a string |

## Decisions

- (none yet)

## Open questions

- Must work on both macOS and Windows (see "Cross-platform" in CLAUDE.md). Windows: `pywin32` / `psutil`;
  macOS: `pyobjc` (AppKit; browser tab titles may need Accessibility / Screen Recording permission).
  Keep these imports inside `mom/screen/_windows.py` / `_macos.py`.
- Where does `goal` come from: a CLI flag, `.env`, or the calendar later?
- Dedup key: suggest `screen:<distraction>:<distraction_start_iso>`, so each new distraction session can call again.
