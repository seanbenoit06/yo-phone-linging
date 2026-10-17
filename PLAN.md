# Mom.exe Plan

## Goal

An AI agent that phone-calls you when you procrastinate.

## Architecture (current)

```
trigger.check() → mom/run.py (cooldown, dedup) → mom/caller.py
  → ElevenLabs API (sip-trunk/outbound-call) → Photon SIP trunk → your phone
```

- Photon 2.0 beta: US number + SIP voice profile (outbound over TLS, `sip.photon.codes:5061`)
- ElevenLabs: one voice agent per feature, with prompts using dynamic variables (see `docs/features/`)
- Python: only `requests` + `python-dotenv` in the core, no frameworks
- How the code fits together and who owns what: [CLAUDE.md](CLAUDE.md)

## Progress

### ✅ Phase 1: code places a real phone call
- [x] `.env.example` / `.gitignore`
- [x] `list_numbers.py`: list ElevenLabs phone numbers and their `phone_number_id`
- [x] `call_me.py`: place the call with dynamic variables, poll until it ends, print the transcript
- [x] Error messages: missing env vars, 401, 403, 404, 422, 429, 5xx, "phone didn't ring"
- [x] First real call tested end to end

### ✅ Groundwork for parallel features
- [x] Shared core in `mom/` (config, ElevenLabs client, caller, state, run loop)
- [x] Trigger contract (`mom/triggers/base.py`) + registry, stub triggers for both features
- [x] `--dry-run`, `--once`, `--triggers`; global cooldown, persistent dedup
- [x] Per-feature ElevenLabs agents (`ELEVENLABS_AGENT_ID_<TRIGGER>`)

### 🚧 Features (in parallel; status lives in each feature doc)
- [ ] Screen monitor: Mom calls when you're off task → [docs/features/screen.md](docs/features/screen.md)
- [ ] Calendar: Mom calls about upcoming meetings / deadlines → [docs/features/calendar.md](docs/features/calendar.md)

### ⏭️ Shared, later
- [ ] Save the transcript (e.g. as JSON) for follow-ups
- [ ] Text a follow-up based on the transcript (e.g. "You said you'd finish in 30 minutes. How's it going?").
      Fits as a post-call hook in `mom/caller.py` so it works for every trigger.
