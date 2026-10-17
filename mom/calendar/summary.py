"""Turn today's events into the calendar agent's dynamic variables.

STUB (calendar step 2): returns the right keys with naive content, so the briefing can
be dry-run before the real formatting lands.
"""

from datetime import datetime

from mom.calendar.events import CalendarEvent


def summarize_events(events: list[CalendarEvent], now: datetime) -> dict[str, str]:
    """The calendar agent's dynamic variables (all strings), exactly these keys:
    todays_events  one line per event, e.g. "2:30 PM-3:20 PM  CSE 312 midterm (Gates G20)  [next]"
                   with [done] / [now] / [next] markers; "(nothing on the calendar today)" if empty
    event_count    "4"
    next_event     "CSE 312 midterm at 2:30 PM (in 45 min)" or "nothing else today"
    current_time   "10:05 AM, Friday October 17"
    """
    upcoming = [event for event in events if not event.all_day and event.start > now]
    return {
        "todays_events": "\n".join(event.title for event in events) or "(nothing on the calendar today)",
        "event_count": str(len(events)),
        "next_event": upcoming[0].title if upcoming else "nothing else today",
        "current_time": now.isoformat(timespec="minutes"),
    }
