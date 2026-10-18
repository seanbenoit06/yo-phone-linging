# Feature: calendar (meetings & deadlines)

Mom calls when a meeting is about to start or a deadline is coming up, using Google Calendar.

- Trigger: `calendar` → `mom/triggers/calendar.py`
- Feature code: `mom/calendar/` (auth, API client)
- Agent: `ELEVENLABS_AGENT_ID_CALENDAR`
- Run: `python -m mom.calendar.brief [--dry-run] [--fake-events]` (setup: README → Calendar briefing)

## Status

**Milestone 1 (in progress): the briefing call.** Mom knows everything on today's calendar
and nags you about it. On demand for now; a morning cron job / scheduled task can run the same command later.

- [x] Stub trigger registered (never fires)
- [x] Step 0: contract and scaffolding (`mom/calendar/` with `CalendarEvent`, `fake_events`; truststore moved to `mom/__init__.py`)
- [x] Step 1: Google OAuth (`auth.py`: desktop app flow, `token.json`) and `fetch_todays_events` (`gcal.py`), tested with recorded API JSON
- [x] Step 2: `summarize_events` formatting (`[done]` / `[now]` / `[next]` markers, 1500-char cap)
- [x] Step 3: ElevenLabs calendar agent created from `docs/agents/calendar-agent.md` (`python -m mom.calendar.agent`)
- [x] Step 4: `python -m mom.calendar.brief` (ad hoc; the time-of-day trigger is postponed in favor of cron)
- [x] `--date YYYY-MM-DD` / `--at HH:MM`: brief any day (other days default to that morning, before the first event)
- [x] Step 5: real Google sign-in, real call about 2026-10-16 from the real calendar (2026-10-17)
- [ ] Cron / Task Scheduler entry for a daily morning call

Later milestones: a call N minutes before each meeting; deadlines (all-day events / Google Tasks).

## Agent prompt variables

The variables the daily briefing sends, which the calendar agent's prompt must use:

| Variable | Example | Meaning |
|---|---|---|
| `user_name` | `Jay` | added automatically by the caller |
| `todays_events` | `2:30 PM-3:20 PM  CSE 312 midterm (Gates G20)  [next]` | one line per event, `[done]` / `[now]` / `[next]` markers |
| `event_count` | `4` | number of events today |
| `next_event` | `CSE 312 midterm at 2:30 PM (in 45 min)` | or `nothing else today` |
| `current_time` | `10:05 AM, Saturday October 17` | when the call is placed |

The prompt and first message that use them: `docs/agents/calendar-agent.md`.

## Decisions

- Briefing is ad hoc (`python -m mom.calendar.brief`), scheduled later by cron / Task Scheduler rather than `mom.run`.
  `--date` briefs another day from that morning: 08:00, or 30 min before the first timed event if earlier,
  so the first event is `[next]`, not `[now]`. `--at` overrides the time.
  `build_briefing_reason` still sets dedup key `calendar:briefing:<YYYY-MM-DD>` for when it's wired into a loop.
- Google Calendar REST API via `google-auth`'s `AuthorizedSession` (on `requests`, so truststore applies), scope `calendar.readonly`.
- `CALENDAR_IDS`: comma-separated IDs, or `all` (every calendar in your list except hidden and free/busy-only ones).
  Skipped: cancelled events, events you declined, "working location" chips. The same invite on two calendars counts once.
- The summary is plain text in dynamic variables; the agent turns it into nagging (no extra LLM call).
- Calendar agent: a duplicate of the default agent (voice, LLM, end_call) with its own prompt. The repo doc is the source of truth.
- Meeting reminders (later milestone) dedup key: `calendar:<event_id>:<start_iso>`, so moving an event re-arms the call.

## Open questions

- Deadlines: all-day events, keyword-tagged events (e.g. "DUE:"), or Google Tasks due dates?
  This decides the OAuth scopes (`calendar.readonly`, maybe `tasks.readonly`).
- How far ahead to call for meetings vs. deadlines? Call more than once for a big deadline?
