# Feature: screen (off-task monitor)

Mom calls when you've been distracted for too long (active app / website isn't what you should be doing).

**Implemented in the app, not as a `mom/` trigger:** `detector.py` decides on-task vs distracted,
`brain.py` tracks the distraction time and runs the escalation ladder, `main.py` wires them up.
The `mom/triggers/screen.py` stub stays unused. See `INTERFACES.md`.

- Feature code: `detector.py` (macOS: `osascript` for the frontmost app and the browser tab)
- Agent: the default agent (`ELEVENLABS_AGENT_ID`), set up per `agent/SETUP.md`
- Run: `python detector.py "CSE homework"` (detector alone) or `python main.py` (whole app).
  Flags: `--llm gemini|jev|both` to compare models, `--vision` to turn on screenshots.
- Config (`.env`): `GEMINI_API_KEY`, `AI_GATEWAY_API_KEY` (only for Jev), `DETECTOR_LLM=gemini|jev`,
  `DETECTOR_VISION=0|1`
- macOS permissions for the terminal app running Python: Accessibility (window titles),
  Automation → each browser (tab title + URL), Screen & System Audio Recording (only with `DETECTOR_VISION=1`)

## Status

- [x] Detect the active app / window title and browser tab: Chrome, Edge, Arc, Brave, Safari give
  title + URL; other apps give their window title; web apps show their real name (macOS only;
  on Windows `get_activity()` returns `None` for now)
- [x] Classify distracted vs. on task (rules first, then Gemini / Jev, per-title cache)
- [x] Optional screenshot second look when the title is unclear (`DETECTOR_VISION=1`), tested with
  real captures and fake Discord screens; not yet run inside `main.py`
- [ ] Arc untested (not installed); Chrome / Safari scripts compile but weren't run live
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

All from 2026-10-17.

- **Title + URL first, screenshots only as a fallback.** Text is faster (~0.8 s vs ~2.5 s), needs no
  Screen Recording permission, and sends one line instead of the whole screen. Screen monitoring
  isn't the selling point, so reliability wins.
- **Rules before the LLM.** tiktok.com, instagram.com, youtube.com/shorts, reddit.com, x.com,
  twitter.com, facebook.com, netflix.com, twitch.tv and the iPhone Mirroring app are always
  DISTRACTED (0 s, no API call). iPhone Mirroring says "your phone", like `webcam.py`.
- **Default LLM: `gemini-3.5-flash-lite`** (JSON schema output, minimal thinking, ~0.8 s).
  Jev (`typesafe-ai/jev` via Vercel AI Gateway `/v1/decisions`) is an option. On 16 sample titles
  it was 3x faster (0.24 s vs 0.77 s) but harsher on ambiguous screens (Spotify, lofi study music →
  distracted). Gemini raises fewer false alarms and fits the MLH Gemini track.
- Jev through the gateway is text-only (images → HTTP 400) and needs paid Vercel credits (free tier → 403).
- **Chat apps are UNSURE** unless the channel is clearly about the goal or clearly fun. This stopped
  verdicts flip-flopping between Discord channels.
- **Screenshots** (`DETECTOR_VISION=1`) only run when the LLM says UNSURE. They capture the front
  window only (`screencapture -R` with its bounds), shrink it to a 1024 px JPEG (~77 KB), send it to
  Gemini, and delete it right away. The verdict is reused for 30 s per window. The screenshot is
  skipped if less than 2.5 s of the 5 s budget is left.
- Unread counts like `(471) ` are stripped from titles so the per-title cache keeps hitting.
- **URLs lose their `?query` and `#fragment`** before they reach the LLM or the cache key. Those parts
  hold record IDs and sometimes tokens. Keeping them made every CRM record a new cache entry, and the
  verdict flip-flopped between on_task and distracted on the same site.

## Open questions

- Must work on both macOS and Windows (see "Cross-platform" in CLAUDE.md). macOS uses `osascript`,
  `screencapture` and `sips` (built in, no packages). Windows would need `pywin32` / `psutil` for the
  active window. Not started.
- Where does `goal` come from: a CLI flag, `.env`, or the calendar later?
- Dedup key: suggest `screen:<distraction>:<distraction_start_iso>`, so each new distraction session can call again.
