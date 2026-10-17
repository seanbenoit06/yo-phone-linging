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

### ⏭️ Phase 2: follow up by text after the call
- [ ] Save the transcript (e.g. as JSON) for follow-ups
- [ ] Have the agent text a follow-up based on the transcript (e.g. "You said you'd finish in 30 minutes. How's it going?")

### 💡 Later
- [ ] Detect procrastination (e.g. the active app / website) and trigger `call_me.py` automatically
- [ ] Compute `minutes_distracted` for real instead of hardcoding `"5"`
