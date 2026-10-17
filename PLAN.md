# Mom.exe Plan

## Goal

An AI agent that phone-calls you when you procrastinate.

## Architecture (current)

```
call_me.py → ElevenLabs API (sip-trunk/outbound-call) → Photon SIP trunk → your phone
```

- Photon 2.0 beta: US number + SIP voice profile (outbound over TLS, `sip.photon.codes:5061`)
- ElevenLabs: voice agent whose prompt uses dynamic variables `{{user_name}}`, `{{goal}}`, `{{distraction}}`, `{{minutes_distracted}}`
- Python: only `requests` + `python-dotenv`, no frameworks yet

## Progress

### ✅ Phase 1: code places a real phone call
- [x] `.env.example` / `.gitignore`
- [x] `list_numbers.py`: list ElevenLabs phone numbers and their `phone_number_id`
- [x] `call_me.py`: place the call with dynamic variables, poll until it ends, print the transcript
- [x] Error messages: missing env vars, 401, 403, 404, 422, 429, 5xx, "phone didn't ring"
- [x] First real call tested end to end

### 🔨 Phase 2: the full escalation loop (built in parallel, see `INTERFACES.md`)
- [x] Core: `models.py`, `settings.py`, `caller.py`, `brain.py`, `main.py`
- [x] Ladder: `?` text → nudge call → follow-up text quoting the promise → callback → snitch call to an opted-in friend
- [x] "I'm actually working" → apologize and never flag that activity again this session
- [ ] iMessage: `texter.py` + `intent.py` (Photon shared line)
- [ ] Detector: `detector.py` (window / tab title + Gemini)
- [ ] Agent prompt: `agent/` (nudge / callback / snitch flows, Data Collection fields)
- [ ] Webcam: `webcam.py` (Perceptron, phone-in-hand)
- [ ] End-to-end demo run with `DEMO_MODE=1`

### 💡 Later
- [ ] Persist excuses across runs (`memory.json`, maybe MLH Backboard)
- [ ] Rehearse the demo, Devpost, make the repo public
- [ ] VEYZL audit on a PR, GoDaddy domain
- [ ] Roadmap only (pitch): Team Mode, Bet Mode, "Future You" voice, focus dashboard
