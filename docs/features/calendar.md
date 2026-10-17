# Feature: calendar (meetings & deadlines)

Mom calls when a meeting is about to start or a deadline is coming up, using Google Calendar.

- Trigger: `calendar` → `mom/triggers/calendar.py`
- Feature code: `mom/calendar/` (auth, API client)
- Agent: `ELEVENLABS_AGENT_ID_CALENDAR`
- Run: `python -m mom.run --triggers calendar --dry-run`

## Status

**Milestone 1 (in progress): the daily briefing call.** Mom calls once a day, knows everything
on today's calendar, and nags you about it.

- [x] Stub trigger registered (never fires)
- [x] Step 0: contract and scaffolding (`mom/calendar/` with `CalendarEvent`, `fake_events`, stubs; truststore moved to `mom/__init__.py`)
- [ ] Step 1: Google OAuth (desktop app flow, `token.json`) and `fetch_todays_events`
- [ ] Step 2: `summarize_events` formatting (`[done]` / `[now]` / `[next]` markers)
- [ ] Step 3: ElevenLabs calendar agent and prompt (`docs/agents/calendar-agent.md`)
- [ ] Step 4: briefing trigger at `CALENDAR_BRIEFING_TIME` and `python -m mom.calendar.brief`
- [ ] Step 5: integration, tested with a real call

Later milestones: a call N minutes before each meeting; deadlines (all-day events / Google Tasks).

## Agent prompt variables

The variables the daily briefing sends, which the calendar agent's prompt must use:

| Variable | Example | Meaning |
|---|---|---|
| `user_name` | `Jay` | added automatically by the caller |
| `todays_events` | `2:30 PM-3:20 PM  CSE 312 midterm (Gates G20)  [next]` | one line per event, `[done]` / `[now]` / `[next]` markers |
| `event_count` | `4` | number of events today |
| `next_event` | `CSE 312 midterm at 2:30 PM (in 45 min)` | or `nothing else today` |
| `current_time` | `10:05 AM, Friday October 17` | when the call is placed |

## Decisions

- Daily briefing dedup key: `calendar:briefing:<YYYY-MM-DD>`, so it calls at most once per day.
- Google Calendar REST API via `google-auth`'s `AuthorizedSession` (on `requests`, so truststore applies), scope `calendar.readonly`.
- Settings: `CALENDAR_BRIEFING_TIME` (`HH:MM`), `CALENDAR_IDS` (comma-separated, or `all`).
- Meeting reminders (later milestone) dedup key: `calendar:<event_id>:<start_iso>`, so moving an event re-arms the call.

## Open questions

- Deadlines: all-day events, keyword-tagged events (e.g. "DUE:"), or Google Tasks due dates?
  This decides the OAuth scopes (`calendar.readonly`, maybe `tasks.readonly`).
- How far ahead to call for meetings vs. deadlines? Call more than once for a big deadline?
- Which calendars: primary only, or all of them?
