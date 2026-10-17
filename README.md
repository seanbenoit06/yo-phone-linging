# Mom.exe

An AI agent that phone-calls you when you procrastinate.

```
trigger (screen / calendar) → mom.run → ElevenLabs API → Photon SIP trunk → your phone rings
```

Features are **triggers** in `mom/triggers/` that decide when Mom calls and why. The shared core in
`mom/` places the call and enforces cooldowns and dedup. See [CLAUDE.md](CLAUDE.md) for the
architecture, who owns which files, and how to add a feature. Each feature's status is in `docs/features/`.

## Prerequisites (already done in the dashboards)

- Photon: US number, SIP voice profile, outbound calls enabled.
- ElevenLabs: voice agent whose prompt / first message use `{{user_name}}`, `{{goal}}`,
  `{{distraction}}`, `{{minutes_distracted}}`, and the Photon number imported via
  **From SIP Trunk** with outbound configured. "Send Test Call" in the dashboard rings your phone.
- Python 3.10+ (3.12 recommended; pinned in `.python-version`). Works on macOS, Windows and Linux.

## Run steps

```bash
# 1. Create a virtual env and install dependencies (uv reads .python-version)
uv venv
source .venv/bin/activate          # Windows (PowerShell): .venv\Scripts\Activate.ps1
uv pip install -r requirements.txt

# 2. Create your .env and fill in ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, MY_PHONE_NUMBER, USER_NAME
cp .env.example .env               # Windows (PowerShell): Copy-Item .env.example .env

# 3. Find your phone_number_id and paste it into ELEVENLABS_PHONE_NUMBER_ID in .env
python list_numbers.py

# 4. Make Mom call you once, right now (tests the call path)
python call_me.py
python call_me.py --goal "CSE homework" --distraction "TikTok"

# 5. Run Mom.exe: watch triggers and call when one fires
python -m mom.run --dry-run --once          # one pass, print instead of calling
python -m mom.run --triggers calendar       # just one feature, real calls
python -m mom.run                           # every feature
```

No `uv`? `python3 -m venv .venv`, activate it as above, then `pip install -r requirements.txt`
(on Windows the command is usually `python`, not `python3`).

HTTPS uses your OS certificate store (via `truststore`), so antivirus TLS scanning (Norton, etc.),
corporate proxies and macOS's "Install Certificates.command" problem don't break API calls.

Each call prints the full API response (including `conversation_id`), then polls the
conversation every 3 seconds until the call ends and prints the status and transcript.

## Files

| File | What it does |
|---|---|
| `list_numbers.py` | Lists phone numbers imported into ElevenLabs with their `phone_number_id` |
| `call_me.py` | Places one call right now, waits for it to end, prints the transcript |
| `mom/run.py` | Main loop: polls triggers, applies cooldown + dedup, places calls |
| `mom/caller.py` | Places a call, waits for it to end, prints the transcript |
| `mom/triggers/` | One file per feature (`screen.py`, `calendar.py`) + the shared contract (`base.py`) |
| `mom/config.py`, `mom/elevenlabs.py` | Load `.env`; call the ElevenLabs API with readable errors |
| `mom/state.py` | Remembers past calls in `state/state.json` (git-ignored) |
| `.env.example` | Template for `.env` (secrets live only in `.env`, which is git-ignored) |

## Troubleshooting

| You see | Do this |
|---|---|
| `Missing environment variables` | Fill the listed keys in `.env` |
| `401 Unauthorized` | API key is wrong. Re-copy it into `ELEVENLABS_API_KEY` |
| `403 Forbidden` | Key lacks permission. Enable Agents / Conversational AI access on the key |
| `422 Validation error` | Read the listed fields. Usually `to_number` isn't E.164 or an ID is wrong |
| Success, but phone didn't ring | ElevenLabs → **Conversations**: open the `conversation_id`. Then check the number's outbound SIP settings (address, TLS, Photon username/password) |
