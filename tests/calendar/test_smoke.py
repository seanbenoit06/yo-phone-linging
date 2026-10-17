"""Smoke test: every calendar module imports and the step 0 pieces fit together."""

import importlib

import pytest

from mom.calendar.briefing import build_briefing_reason
from mom.calendar.events import CalendarEvent
from mom.calendar.summary import summarize_events

MODULES = [
    "mom.calendar",
    "mom.calendar.events",
    "mom.calendar.fake",
    "mom.calendar.gcal",
    "mom.calendar.summary",
    "mom.calendar.briefing",
    "mom.triggers.calendar",
]


@pytest.mark.parametrize("module", MODULES)
def test_imports(module):
    importlib.import_module(module)


def test_fake_events_cover_the_day(events, now):
    assert all(isinstance(event, CalendarEvent) for event in events)
    assert all(event.start.tzinfo and event.end.tzinfo for event in events)
    assert events == sorted(events, key=lambda event: event.start)
    timed = [event for event in events if not event.all_day]
    assert any(event.end <= now for event in timed), "a done event"
    assert any(event.start <= now < event.end for event in timed), "an in-progress event"
    assert any(event.start > now for event in timed), "an upcoming event"
    assert any(a.start < b.end and b.start < a.end for a, b in zip(timed, timed[1:])), "overlapping events"
    all_day = [event for event in events if event.all_day]
    assert all_day and all_day[0].start.hour == 0 and all_day[0].start.date() == now.date()


def test_summary_has_the_contract_keys(events, now):
    variables = summarize_events(events, now)
    assert set(variables) == {"todays_events", "event_count", "next_event", "current_time"}
    assert all(isinstance(value, str) for value in variables.values())


def test_briefing_reason(events, now):
    reason = build_briefing_reason(events, now)
    assert reason.trigger == "calendar"
    assert reason.dedup_key == "calendar:briefing:2026-10-17"
    assert reason.dynamic_variables == summarize_events(events, now)
