"""A made-up day of events, for tests and `--fake-events` (no Google needed)."""

from datetime import datetime, timedelta

from mom.calendar.events import CalendarEvent


def fake_events(now: datetime) -> list[CalendarEvent]:
    """A realistic day relative to now: done, in-progress, upcoming, all-day, overlapping.

    now must be timezone-aware. Times are rounded to 5 minutes so they read like real
    events. Close to midnight the timed events can spill into yesterday or tomorrow.
    """
    if now.tzinfo is None:
        raise ValueError("fake_events needs a timezone-aware now, e.g. datetime.now().astimezone()")
    base = now.replace(minute=now.minute - now.minute % 5, second=0, microsecond=0)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def at(minutes):
        return base + timedelta(minutes=minutes)

    return [
        CalendarEvent(
            title="Problem set 3 due",
            start=midnight,
            end=midnight + timedelta(days=1),
            all_day=True,
            calendar="UW classes",
        ),
        CalendarEvent(
            title="Gym",
            start=at(-180),
            end=at(-120),
            all_day=False,
            location="IMA",
        ),
        CalendarEvent(
            title="CSE 312 lecture",
            start=at(-25),
            end=at(25),
            all_day=False,
            location="Gates G20",
            calendar="UW classes",
        ),
        CalendarEvent(
            title="CSE 312 midterm",
            start=at(45),
            end=at(95),
            all_day=False,
            location="Gates G20",
            calendar="UW classes",
        ),
        # Overlaps the midterm.
        CalendarEvent(
            title="Office hours",
            start=at(75),
            end=at(135),
            all_day=False,
            location="Allen 3rd floor",
            calendar="UW classes",
        ),
        CalendarEvent(
            title="Dinner with Sam",
            start=at(420),
            end=at(510),
            all_day=False,
            location="Thai Tom",
        ),
    ]
