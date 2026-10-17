# Mom.exe

An AI agent that phone-calls you when you procrastinate.

Right now this repo does one thing: **your code places a real outbound call to your phone.**

```
call_me.py → ElevenLabs API → Photon SIP trunk → your phone rings
```

## Prerequisites (already done in the dashboards)

- Photon: US number, SIP voice profile, outbound calls enabled.
- ElevenLabs: voice agent whose prompt / first message use `{{user_name}}`, `{{goal}}`,
  `{{distraction}}`, `{{minutes_distracted}}`, and the Photon number imported via
  **From SIP Trunk** with outbound configured. "Send Test Call" in the dashboard rings your phone.
- Python 3.9+.

## Run steps

```bash
cd mom-exe

# 1. Create a virtual env and install dependencies
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt

# 2. Create your .env and fill in ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, MY_PHONE_NUMBER, USER_NAME
cp .env.example .env

# 3. Find your phone_number_id and paste it into ELEVENLABS_PHONE_NUMBER_ID in .env
python list_numbers.py

# 4. Make Mom call you
python call_me.py
python call_me.py --goal "CSE homework" --distraction "TikTok"
```

No `uv`? `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
works too (macOS's built-in Python 3.9 prints a harmless `NotOpenSSLWarning`).

`call_me.py` prints the full API response (including `conversation_id`), then polls the
conversation every 3 seconds until the call ends and prints the status and transcript.

## Run the agent

```bash
python main.py
```

Then text the agent on iMessage, e.g. `Finishing CSE homework by 9 PM`. Mom watches your screen,
texts `?` when you drift, calls you if you keep going, texts a follow-up quoting your promise,
calls back later, and calls `FRIEND_PHONE_NUMBER` if you ignore her.

Set `DEMO_MODE=1` in `.env` so the whole ladder fits in a 3-minute demo. See `INTERFACES.md`
for how the modules fit together.

## Files

| File | What it does |
|---|---|
| `main.py` | The agent loop: reads texts, watches the screen, runs the brain, executes actions |
| `brain.py` | Escalation state machine (text → call → callback → snitch) |
| `caller.py` | Places an ElevenLabs outbound call and waits for the result |
| `models.py` | Shared types every module uses |
| `settings.py` | Ladder timings (`DEMO_MODE`) |
| `list_numbers.py` | Lists phone numbers imported into ElevenLabs with their `phone_number_id` |
| `call_me.py` | Places one test call, waits for it to end, prints the transcript |
| `common.py` | Loads `.env` and calls the ElevenLabs API with readable errors |
| `.env.example` | Template for `.env` (secrets live only in `.env`, which is git-ignored) |

## Troubleshooting

| You see | Do this |
|---|---|
| `Missing environment variables` | Fill the listed keys in `.env` |
| `401 Unauthorized` | API key is wrong. Re-copy it into `ELEVENLABS_API_KEY` |
| `403 Forbidden` | Key lacks permission. Enable Agents / Conversational AI access on the key |
| `422 Validation error` | Read the listed fields. Usually `to_number` isn't E.164 or an ID is wrong |
| Success, but phone didn't ring | ElevenLabs → **Conversations**: open the `conversation_id`. Then check the number's outbound SIP settings (address, TLS, Photon username/password) |
