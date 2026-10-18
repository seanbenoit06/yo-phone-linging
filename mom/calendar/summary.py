"""Turn today's events into the calendar agent's dynamic variables (plain text, no LLM)."""

from datetime import datetime

from mom.calendar.events import CalendarEvent

MAX_EVENTS_CHARS = 1500
MAX_FIELD_CHARS = 120
EMPTY_DAY = "(nothing on the calendar today)"
NOTHING_NEXT = "nothing else today"
# Built by hand: strftime("%-I") crashes on Windows, and %A / %B follow the OS locale.
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def summarize_events(events: list[CalendarEvent], now: datetime) -> dict[str, str]:
    """The calendar agent's dynamic variables (all strings), exactly these keys:
    todays_events  one line per event, e.g. "2:30 PM-3:20 PM  CSE 312 midterm (Gates G20)  [next]"
                   with [done] / [now] / [next] markers; "(nothing on the calendar today)" if empty
    event_count    "4"
    next_event     "CSE 312 midterm at 2:30 PM (in 45 min)" or "nothing else today"
    current_time   "10:05 AM, Friday October 17"
    """
    all_day = [event for event in events if event.all_day]
    timed = sorted((event for event in events if not event.all_day), key=lambda event: event.start)
    upcoming = next((event for event in timed if event.start > now), None)

    # (priority, line): when the list is too long, the lowest priority lines go first.
    entries = [(1, f"All day  {_clip(event.title)}{_where(event)}") for event in all_day]
    for event in timed:
        if event.end <= now:
            priority, marker = 0, "  [done]"
        elif event.start <= now:
            priority, marker = 2, "  [now]"
        else:
            priority, marker = 2, "  [next]" if event is upcoming else ""
        line = f"{format_time(event.start)}-{format_time(event.end)}  {_clip(event.title)}{_where(event)}{marker}"
        entries.append((priority, line))

    return {
        "todays_events": _fit(entries) if entries else EMPTY_DAY,
        "event_count": str(len(events)),
        "next_event": _next_event(upcoming, now),
        "current_time": f"{format_time(now)}, {DAYS[now.weekday()]} {MONTHS[now.month - 1]} {now.day}",
    }


def format_time(dt):
    """2:30 PM"""
    return f"{dt.hour % 12 or 12}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}"


def format_minutes(minutes):
    """45 min, 1 hr, 2 hr 5 min"""
    hours, minutes = divmod(minutes, 60)
    if not hours:
        return f"{minutes} min"
    return f"{hours} hr" + (f" {minutes} min" if minutes else "")


def _where(event):
    return f" ({_clip(event.location)})" if event.location else ""


def _clip(text, limit=MAX_FIELD_CHARS):
    """Pasted notes in a title or location shouldn't push every other event out."""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _next_event(event, now):
    if event is None:
        return NOTHING_NEXT
    minutes = max(1, round((event.start - now).total_seconds() / 60))
    return f"{_clip(event.title)} at {format_time(event.start)} (in {format_minutes(minutes)})"


def _fit(entries):
    """Join the lines, dropping done events first (then all-day, then the latest) to stay under the cap."""
    kept = list(range(len(entries)))
    # Lowest priority first; done events oldest-first, everything else latest-first.
    drop_order = sorted(kept, key=lambda i: (entries[i][0], i if entries[i][0] == 0 else -i))

    def render(dropped):
        lines = [entries[i][1] for i in kept]
        if dropped:
            lines.append(f"(+{dropped} more)")
        return "\n".join(lines)

    text = render(0)
    for dropped, index in enumerate(drop_order, start=1):
        if len(text) <= MAX_EVENTS_CHARS:
            break
        kept.remove(index)
        text = render(dropped)
    return text
