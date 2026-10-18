"""Build the CallReason for the daily briefing call."""

import re
from datetime import date, datetime, time, timedelta

from mom.calendar.events import CalendarEvent
from mom.calendar.summary import summarize_events
from mom.triggers.base import CallReason

# A briefing for another day is told as if it's that morning, so its events are still ahead.
DEFAULT_BRIEFING_TIME = "08:00"
_TIME_PATTERN = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def briefing_time(day=None, at=None, real_now=None):
    """The moment the briefing is told from, timezone-aware local time.

    day: "YYYY-MM-DD" (default today). at: "HH:MM", 24-hour (default: the real time
    for today, DEFAULT_BRIEFING_TIME for any other day; see before_first_event).
    Raises ValueError with a readable message on bad input.
    """
    real_now = real_now or datetime.now().astimezone()
    if day:
        try:
            the_day = date.fromisoformat(day)
        except ValueError:
            raise ValueError(f"--date must look like 2026-10-16 (YYYY-MM-DD), got {day!r}.")
    else:
        the_day = real_now.date()

    if at is None and the_day == real_now.date():
        return real_now
    at = at or DEFAULT_BRIEFING_TIME
    match = _TIME_PATTERN.match(at.strip())
    if not match:
        raise ValueError(f"--at must be 24-hour HH:MM like 08:30 or 17:45, got {at!r}.")
    clock = time(int(match.group(1)), int(match.group(2)))
    # Naive local time → aware in the OS timezone, so the UTC offset is right for that day (DST included).
    return datetime.combine(the_day, clock).astimezone()


def before_first_event(events, now, lead_minutes=30):
    """Move a default-time briefing earlier so the day's first timed event is still ahead of it."""
    starts = [event.start for event in events if not event.all_day and event.start.date() == now.date()]
    if not starts:
        return now
    earliest = min(starts) - timedelta(minutes=lead_minutes)
    if earliest >= now:
        return now
    return max(earliest, now.replace(hour=0, minute=0, second=0, microsecond=0))


def build_briefing_reason(events: list[CalendarEvent], now: datetime) -> CallReason:
    """CallReason(trigger="calendar", dedup_key="calendar:briefing:<date>", dynamic_variables=summarize_events(...))"""
    return CallReason(
        trigger="calendar",
        dedup_key=f"calendar:briefing:{now.date().isoformat()}",
        dynamic_variables=summarize_events(events, now),
        summary=f"Daily briefing: {len(events)} event{'' if len(events) == 1 else 's'}",
    )
