# Mom.exe

An AI agent that phone-calls you when you procrastinate.

```
iMessage + screen (+ webcam) → main.py → brain.py → ElevenLabs API → Photon SIP trunk → your phone rings
```

`main.py` is the app: it reads your iMessages, watches your screen, and lets `brain.py` (the
escalation state machine) decide when Mom texts `?`, calls, calls back, or calls your opted-in
friend. See [INTERFACES.md](INTERFACES.md) for how the modules fit together and who owns what.

`mom/` holds the trigger framework (`mom/triggers/`), where the calendar feature is being built.
See [CLAUDE.md](CLAUDE.md) and `docs/features/`.

## Prerequisites (already done in the dashboards)

- Photon: US number, SIP voice profile, outbound calls enabled; your phone assigned to a shared iMessage line.
- ElevenLabs: voice agent set up as described in `agent/SETUP.md` (First message is exactly
  `{{opening_line}}`), and the Photon number imported via **From SIP Trunk** with outbound configured.
- Python 3.10+ (3.12 recommended; pinned in `.python-version`). Works on macOS, Windows and Linux.
  The screen detector (`detector.py`) and webcam (`webcam.py`, needs `ffmpeg`) are macOS-only for now.

## Run steps

```bash
# 1. Create a virtual env and install dependencies (uv reads .python-version)
uv venv
source .venv/bin/activate          # Windows (PowerShell): .venv\Scripts\Activate.ps1
uv pip install -r requirements.txt

# 2. Create your .env and fill in the keys (see comments in .env.example)
cp .env.example .env               # Windows (PowerShell): Copy-Item .env.example .env

# 3. Find your phone_number_id and paste it into ELEVENLABS_PHONE_NUMBER_ID in .env
python list_numbers.py

# 4. Make Mom call you once, right now (tests the call path)
python call_me.py --dry-run        # print what would be sent, no call
python call_me.py
python call_me.py --goal "CSE homework" --distraction "TikTok"

# 5. Run Mom.exe
python main.py
```

Then text the agent on iMessage, e.g. `Finishing CSE homework by 9 PM`. Mom watches your screen,
texts `?` when you drift, calls you if you keep going, texts a follow-up quoting your promise,
calls back later, and calls `FRIEND_PHONE_NUMBER` if you ignore her.
Set `DEMO_MODE=1` in `.env` so the whole ladder fits in a 3-minute demo.

### Calendar briefing (Google Calendar)

Mom reads today's Google Calendar and calls you about it. One-time setup:

1. [Google Cloud console](https://console.cloud.google.com): create a project and enable the **Google Calendar API**.
2. **Google Auth Platform** → Branding (app name + your email, Audience *External*), then
   Audience → **Test users** → add the Google account whose calendar Mom should read.
3. Clients → Create client → **Desktop app** → download the JSON → save it as `credentials.json` in the project root.
4. `python -m mom.calendar.agent` creates the calendar agent; put the printed ID in `.env` as `ELEVENLABS_AGENT_ID_CALENDAR`.
   Set `CALENDAR_IDS=all` (or comma-separated calendar IDs) in `.env`.

```bash
python -m mom.calendar.gcal                           # sign in (browser, first time) and print today's events
python -m mom.calendar.brief --dry-run                # show what Mom would say, no call
python -m mom.calendar.brief                          # Mom calls you about today, right now
python -m mom.calendar.brief --date 2026-10-16        # about another day, as if it's that morning
python -m mom.calendar.brief --date 2026-10-16 --at 13:30   # ... from 1:30 PM that day
python -m mom.calendar.gcal --date 2026-10-16         # print that day's events, no call
python -m mom.calendar.brief --fake-events --dry-run  # no Google needed
```

Google sign-ins for apps in *Testing* expire after 7 days; Mom then opens the browser again by itself.
For a daily call, schedule `python -m mom.calendar.brief` (no `--date`) with cron / Task Scheduler at the time you want it.

No `uv`? `python3 -m venv .venv`, activate it as above, then `pip install -r requirements.txt`
(on Windows the command is usually `python`, not `python3`).

HTTPS uses your OS certificate store (via `truststore`), so antivirus TLS scanning (Norton, etc.),
corporate proxies and macOS's "Install Certificates.command" problem don't break API calls.

## Files

| File | What it does |
|---|---|
| `main.py` | The agent loop: reads texts, watches the screen, runs the brain, executes actions |
| `brain.py` | Escalation state machine (text → call → callback → snitch) |
| `caller.py` | Places an ElevenLabs outbound call and waits for the result |
| `texter.py`, `intent.py` | iMessage on the Photon shared line; parse your texts |
| `detector.py` | Active app / browser tab + rules and an LLM: on task or distracted? |
| `webcam.py` | Optional: phone-in-hand check from the webcam (`USE_WEBCAM=1`) |
| `models.py`, `settings.py` | Shared types; ladder timings (`DEMO_MODE`) |
| `agent/` | ElevenLabs agent prompt, opening lines, dashboard setup |
| `call_me.py` | Places one test call, waits for it to end, prints the transcript |
| `list_numbers.py` | Lists phone numbers imported into ElevenLabs with their `phone_number_id` |
| `common.py` | Re-exports the shared helpers from `mom/config.py` and `mom/elevenlabs.py` |
| `mom/config.py`, `mom/elevenlabs.py` | Load `.env`; call the ElevenLabs API with readable errors |
| `mom/run.py`, `mom/triggers/` | Trigger framework (calendar feature in progress) |
| `mom/calendar/` | Google Calendar sign-in + fetch, the briefing call (`python -m mom.calendar.brief`) |
| `docs/agents/calendar-agent.md` | Calendar agent prompt + first message (pushed with `python -m mom.calendar.agent`) |
| `.env.example` | Template for `.env` (secrets live only in `.env`, which is git-ignored) |

## Troubleshooting

| You see | Do this |
|---|---|
| `Missing environment variables` | Fill the listed keys in `.env` |
| `401 Unauthorized` | API key is wrong. Re-copy it into `ELEVENLABS_API_KEY` |
| `403 Forbidden` | Key lacks permission. Enable Agents / Conversational AI access on the key |
| `422 Validation error` | Read the listed fields. Usually `to_number` isn't E.164 or an ID is wrong |
| `Missing required dynamic variables` | The agent's prompt uses a `{{variable}}` the code didn't send. Use `caller.build_dynamic_variables()` |
| Success, but phone didn't ring | ElevenLabs → **Conversations**: open the `conversation_id`. Then check the number's outbound SIP settings (address, TLS, Photon username/password) |
