"""Calendar feature: Google Calendar → today's events → Mom's daily briefing call.

Owner: calendar feature. Status and decisions: docs/features/calendar.md

    events.py    CalendarEvent, the type every module below passes around
    gcal.py      fetch_todays_events(now): Google Calendar API (OAuth in auth.py)
    summary.py   summarize_events(events, now): the calendar agent's dynamic variables
    briefing.py  build_briefing_reason(events, now): the CallReason for the daily briefing
    fake.py      fake_events(now): a made-up day for tests and --fake-events

Google libraries are imported only inside gcal.py / auth.py, so the rest works without them.
"""
