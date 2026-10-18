from datetime import datetime, timedelta

from mom.calendar.events import CalendarEvent
from mom.calendar.summary import MAX_EVENTS_CHARS, format_minutes, format_time, summarize_events


def timed(now, title, start_min, end_min, location=""):
    return CalendarEvent(title, now + timedelta(minutes=start_min), now + timedelta(minutes=end_min), False, location)


def all_day(now, title):
    midnight = now.replace(hour=0, minute=0)
    return CalendarEvent(title, midnight, midnight + timedelta(days=1), True)


def test_fake_day(events, now):
    # now = 10:05 AM; fake_events rounds to 10:05 and offsets from there.
    variables = summarize_events(events, now)
    assert variables["todays_events"].splitlines() == [
        "All day  Problem set 3 due",
        "7:05 AM-8:05 AM  Gym (IMA)  [done]",
        "9:40 AM-10:30 AM  CSE 312 lecture (Gates G20)  [now]",
        "10:50 AM-11:40 AM  CSE 312 midterm (Gates G20)  [next]",
        "11:20 AM-12:20 PM  Office hours (Allen 3rd floor)",
        "5:05 PM-6:35 PM  Dinner with Sam (Thai Tom)",
    ]
    assert variables["event_count"] == "6"
    assert variables["next_event"] == "CSE 312 midterm at 10:50 AM (in 45 min)"
    assert variables["current_time"] == "10:05 AM, Saturday October 17"


def test_empty_day(now):
    assert summarize_events([], now) == {
        "todays_events": "(nothing on the calendar today)",
        "event_count": "0",
        "next_event": "nothing else today",
        "current_time": "10:05 AM, Saturday October 17",
    }


def test_everything_done(now):
    variables = summarize_events([timed(now, "Standup", -120, -105), timed(now, "Lab", -60, -5)], now)
    assert variables["todays_events"].splitlines() == [
        "8:05 AM-8:20 AM  Standup  [done]",
        "9:05 AM-10:00 AM  Lab  [done]",
    ]
    assert variables["next_event"] == "nothing else today"


def test_only_all_day_events_have_no_next(now):
    variables = summarize_events([all_day(now, "Essay due")], now)
    assert variables["todays_events"] == "All day  Essay due"
    assert variables["next_event"] == "nothing else today"


def test_overlapping_events_only_one_next(now):
    # Same start: the first one in the list gets [next], the other none.
    events = [timed(now, "Review", 30, 60), timed(now, "Coffee", 30, 45), timed(now, "Call", 40, 50)]
    lines = summarize_events(events, now)["todays_events"].splitlines()
    assert [line.endswith("[next]") for line in lines] == [True, False, False]


def test_event_starting_now_is_now(now):
    lines = summarize_events([timed(now, "Meeting", 0, 30)], now)["todays_events"]
    assert lines.endswith("[now]")


def test_unsorted_input(now):
    events = [timed(now, "Later", 120, 180), timed(now, "Sooner", 20, 40)]
    variables = summarize_events(events, now)
    assert variables["todays_events"].splitlines()[0].startswith("10:25 AM-10:45 AM  Sooner  [next]")
    assert variables["next_event"] == "Sooner at 10:25 AM (in 20 min)"


def test_long_list_keeps_upcoming(now):
    done = [timed(now, f"Old meeting {i} " + "x" * 60, -600 + i, -590 + i) for i in range(20)]
    upcoming = [timed(now, f"Future meeting {i}", 30 + i * 10, 35 + i * 10) for i in range(5)]
    text = summarize_events(done + upcoming, now)["todays_events"]
    assert len(text) <= MAX_EVENTS_CHARS
    assert all(f"Future meeting {i}" in text for i in range(5))
    assert "Old meeting 0 " not in text  # oldest done dropped first
    assert "Old meeting 19 " in text
    assert text.splitlines()[-1].startswith("(+") and text.endswith(" more)")


def test_huge_title_is_clipped_and_next_survives(now):
    variables = summarize_events([timed(now, "Notes " + "x" * 3000, -60, -30), timed(now, "Exam", 30, 90)], now)
    assert "Exam" in variables["todays_events"] and "[next]" in variables["todays_events"]
    assert len(variables["todays_events"]) < 400


def test_12_hour_times(tz):
    assert format_time(datetime(2026, 10, 17, 0, 5, tzinfo=tz)) == "12:05 AM"
    assert format_time(datetime(2026, 10, 17, 12, 0, tzinfo=tz)) == "12:00 PM"
    assert format_time(datetime(2026, 10, 17, 14, 30, tzinfo=tz)) == "2:30 PM"


def test_minutes():
    assert format_minutes(45) == "45 min"
    assert format_minutes(60) == "1 hr"
    assert format_minutes(125) == "2 hr 5 min"


def test_next_event_hours_away(now):
    assert summarize_events([timed(now, "Dinner", 125, 200)], now)["next_event"] == "Dinner at 12:10 PM (in 2 hr 5 min)"
