import pytest

from mom.calendar import agent
from mom.calendar.briefing import briefing_time, build_briefing_reason
from mom.calendar.summary import summarize_events


def test_briefing_time_defaults_to_real_now(now):
    assert briefing_time(real_now=now) is now
    assert briefing_time("2026-10-17", real_now=now) is now


def test_other_day_is_briefed_from_its_morning(now):
    moment = briefing_time("2026-10-16", real_now=now)
    assert (moment.date().isoformat(), moment.hour, moment.minute) == ("2026-10-16", 8, 0)
    assert moment.tzinfo is not None


def test_at_sets_the_clock(now):
    moment = briefing_time("2026-10-16", "13:30", real_now=now)
    assert (moment.day, moment.hour, moment.minute) == (16, 13, 30)
    today = briefing_time(None, "7:05", real_now=now)
    assert (today.day, today.hour, today.minute) == (17, 7, 5)


def test_before_first_event(now):
    from datetime import timedelta

    from mom.calendar.briefing import before_first_event
    from mom.calendar.events import CalendarEvent

    eight = now.replace(hour=8, minute=0)
    work = CalendarEvent("Work", eight, eight + timedelta(hours=4), False)
    deadline = CalendarEvent("Due", eight.replace(hour=0), eight.replace(hour=0) + timedelta(days=1), True)
    assert before_first_event([deadline, work], eight).hour == 7  # 7:30, all-day ignored
    assert before_first_event([deadline, work], eight).minute == 30
    assert before_first_event([], eight) is eight
    late = CalendarEvent("Lunch", eight.replace(hour=12), eight.replace(hour=13), False)
    assert before_first_event([late], eight) is eight  # already ahead
    early = CalendarEvent("Swim", eight.replace(hour=0, minute=10), eight.replace(hour=1), False)
    assert before_first_event([early], eight).hour == 0 and before_first_event([early], eight).minute == 0


@pytest.mark.parametrize("day, at, match", [("10/16/2026", None, "YYYY-MM-DD"), ("2026-10-16", "8am", "HH:MM"), (None, "25:00", "HH:MM")])
def test_bad_date_or_time_is_readable(now, day, at, match):
    with pytest.raises(ValueError, match=match):
        briefing_time(day, at, real_now=now)


def test_reason(events, now):
    reason = build_briefing_reason(events, now)
    assert reason.trigger == "calendar"
    assert reason.dedup_key == "calendar:briefing:2026-10-17"
    assert reason.dynamic_variables == summarize_events(events, now)
    assert reason.summary == "Daily briefing: 6 events"
    assert all(isinstance(value, str) for value in reason.dynamic_variables.values())


def test_summary_singular(events, now):
    assert build_briefing_reason(events[:1], now).summary == "Daily briefing: 1 event"


def test_agent_doc_uses_only_sent_variables():
    first_message, prompt = agent.read_agent_doc()
    import re

    used = set(re.findall(r"{{\s*(\w+)\s*}}", first_message + prompt))
    sent = {"user_name", "todays_events", "event_count", "next_event", "current_time"}
    # ElevenLabs rejects calls that leave a used variable unfilled.
    assert used <= sent
    assert "{{todays_events}}" in prompt and "{{next_event}}" in prompt
