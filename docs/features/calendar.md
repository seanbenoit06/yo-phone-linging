# Feature: calendar (meetings & deadlines)

Mom calls when a meeting is about to start or a deadline is coming up, using Google Calendar.

- Trigger: `calendar` → `mom/triggers/calendar.py`
- Feature code: `mom/calendar/` (auth, API client)
- Agent: `ELEVENLABS_AGENT_ID_CALENDAR`
- Run: `python -m mom.run --triggers calendar --dry-run`

## Status

- [x] Stub trigger registered (never fires)
- [ ] Google OAuth (desktop app flow), token cached locally in `token.json`
- [ ] Fetch upcoming events (`events.list`, `timeMin=now`, `timeMax=now+lookahead`, `singleEvents=true`)
- [ ] Fire for meetings starting within N minutes
- [ ] Deadlines (see open questions)
- [ ] ElevenLabs calendar agent created and prompt written
- [ ] Tested with a real call

## Agent prompt variables

The variables `check()` sends, which the calendar agent's prompt must use:

| Variable | Example | Meaning |
|---|---|---|
| `user_name` | `Jay` | added automatically by the caller |
| `event_title` | `CSE 312 midterm` | (proposed) |
| `minutes_until` | `15` | (proposed) |

## Decisions

- Dedup key: `calendar:<event_id>:<start_iso>`, so moving an event re-arms the call.

## Open questions

- Deadlines: all-day events, keyword-tagged events (e.g. "DUE:"), or Google Tasks due dates?
  This decides the OAuth scopes (`calendar.readonly`, maybe `tasks.readonly`).
- How far ahead to call for meetings vs. deadlines? Call more than once for a big deadline?
- Which calendars: primary only, or all of them?
