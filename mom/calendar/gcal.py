"""Fetch today's events from Google Calendar.

STUB (calendar step 1): fetch_todays_events isn't implemented yet. Use fake_events or
--fake-events until it is.
"""

from datetime import datetime

from mom.calendar.events import CalendarEvent


def fetch_todays_events(now: datetime) -> list[CalendarEvent]:
    """All events overlapping today's local date, from CALENDAR_IDS, sorted by start."""
    raise NotImplementedError("Google Calendar fetching isn't implemented yet (calendar step 1).")
