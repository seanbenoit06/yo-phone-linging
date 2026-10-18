# Mom.exe Plan

## Goal

An AI agent that phone-calls you when you procrastinate.

## Architecture (current)

```
iMessage (texter/intent) + screen (detector) + webcam (optional)
  → main.py → brain.py (escalation ladder) → caller.py
  → ElevenLabs API (sip-trunk/outbound-call) → Photon SIP trunk → your phone
```

- Photon 2.0 beta: US number + SIP voice profile (outbound over TLS, `sip.photon.codes:5061`),
  plus a shared iMessage line for texts
- ElevenLabs: voice agent with dynamic variables and Data Collection (see `agent/SETUP.md`)
- `main.py` is the app. `mom/` is the trigger framework where the calendar feature is built;
  calendar triggers will be wired into `main.py` once they fire.
- Modules and owners: [INTERFACES.md](INTERFACES.md). Trigger framework: [CLAUDE.md](CLAUDE.md)

## Progress

### ✅ Phase 1: code places a real phone call
- [x] `.env.example` / `.gitignore`
- [x] `list_numbers.py`: list ElevenLabs phone numbers and their `phone_number_id`
- [x] `call_me.py`: place the call with dynamic variables, poll until it ends, print the transcript
- [x] Error messages: missing env vars, 401, 403, 404, 422, 429, 5xx, "phone didn't ring"
- [x] First real call tested end to end

### ✅ Groundwork for parallel features
- [x] Shared helpers in `mom/` (config, ElevenLabs client); `truststore`, UTF-8 output, `.python-version`
- [x] Trigger contract (`mom/triggers/base.py`) + registry, stub triggers
- [x] `--dry-run`, `--once`, `--triggers`; global cooldown, persistent dedup

### 🔨 Phase 2: the full escalation loop (see `INTERFACES.md`)
- [x] Core: `models.py`, `settings.py`, `caller.py`, `brain.py`, `main.py`
- [x] Ladder: `?` text → nudge call → follow-up text quoting the promise → callback → snitch call to an opted-in friend
- [x] "I'm actually working" → apologize and never flag that activity again this session
- [x] iMessage: `texter.py` + `intent.py` (Photon shared line, proactive "?" verified)
- [x] Detector: `detector.py` (window / tab title + rules + Gemini, iPhone Mirroring counts as the phone)
- [x] Agent prompt: `agent/` (nudge / callback / snitch, `opening_line`, Data Collection), tested on real calls
- [x] Webcam: `webcam.py` (Gemini; 6/6 phones in frame, 0 false alarms), runs in a background thread
- [x] Screenshot second look when a title is unclear (`DETECTOR_VISION=1`)
- [x] Calendar daily briefing call (Sean) → [docs/features/calendar.md](docs/features/calendar.md)
- [x] Dashboard: `web/` (Family Computer edition) + `api.py`, tested against the live API
- [x] Tasks: Canvas (browser cookie, UW blocks tokens), Trello (one board, read-only), Google Calendar (next 7 days)
- [ ] End-to-end demo run with `DEMO_MODE=1` (dashboard → "?" text → call → follow-up → callback)

### 💡 Later
- [ ] Run the calendar briefing from `main.py` on a schedule
- [ ] Persist excuses across runs (`memory.json`, maybe MLH Backboard)
- [ ] Rehearse the demo, Devpost, make the repo public
- [ ] VEYZL audit on a PR, GoDaddy domain
- [ ] Roadmap only (pitch): Team Mode, Bet Mode, "Future You" voice, focus dashboard
