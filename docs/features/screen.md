# Feature: screen (off-task monitor)

Mom calls when you've been distracted for too long (active app / website isn't what you should be doing).

- Trigger: `screen` → `mom/triggers/screen.py`
- Feature code: `mom/screen/` (active-window detection, distraction tracking)
- Agent: `ELEVENLABS_AGENT_ID_SCREEN` (falls back to the default agent, whose prompt already fits)
- Run: `python -m mom.run --triggers screen --dry-run`

## Status

- [x] Stub trigger registered (never fires)
- [ ] Detect the active app / window title (per OS)
- [ ] Classify distracted vs. on task
- [ ] Track continuous distraction time; fire past a threshold
- [ ] Real `minutes_distracted` (replaces the hardcoded `"5"` from phase 1)
- [ ] Tested with a real call

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
