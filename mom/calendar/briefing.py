"""Build the CallReason for the daily briefing call."""

from datetime import datetime

from mom.calendar.events import CalendarEvent
from mom.calendar.summary import summarize_events
from mom.triggers.base import CallReason


def build_briefing_reason(events: list[CalendarEvent], now: datetime) -> CallReason:
    """CallReason(trigger="calendar", dedup_key="calendar:briefing:<date>", dynamic_variables=summarize_events(...))"""
    return CallReason(
        trigger="calendar",
        dedup_key=f"calendar:briefing:{now.date().isoformat()}",
        dynamic_variables=summarize_events(events, now),
        summary=f"Daily briefing: {len(events)} events",
    )
