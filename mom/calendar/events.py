"""The calendar event type shared by every calendar module."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CalendarEvent:
    title: str
    # Timezone-aware, local time. All-day events start at local midnight.
    start: datetime
    # Timezone-aware. All-day events end at the next local midnight.
    end: datetime
    all_day: bool
    location: str = ""
    # Calendar display name, e.g. "UW classes".
    calendar: str = ""
