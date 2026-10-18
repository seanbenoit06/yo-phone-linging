from mom.calendar import agent
from mom.calendar.briefing import build_briefing_reason
from mom.calendar.summary import summarize_events


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
    assert "{{todays_events}}" in prompt and "{{next_event}}" in first_message
