"""fetch_todays_events against recorded Calendar API JSON. No network: a fake session answers."""

from datetime import datetime, timedelta, timezone

import pytest

from mom.calendar import auth, gcal
from mom.calendar.gcal import CalendarError, fetch_todays_events, normalize_event


class FakeResponse:
    def __init__(self, body, status=200):
        self.body = body
        self.status_code = status
        self.ok = status < 400
        self.text = str(body)

    def json(self):
        return self.body


class FakeSession:
    """Answers GETs from {url_path_suffix: [page bodies]}, following pageToken."""

    def __init__(self, pages, status=200):
        self.pages = pages
        self.status = status
        self.requests = []

    def get(self, url, params=None, timeout=None):
        self.requests.append((url, dict(params or {})))
        if self.status >= 400:
            return FakeResponse(self.pages, self.status)
        path = url.removeprefix(gcal.API_BASE)
        token = (params or {}).get("pageToken")
        index = int(token) if token else 0
        return FakeResponse(self.pages[path][index])


@pytest.fixture
def calendar_ids(monkeypatch):
    def set_ids(value):
        monkeypatch.setattr(gcal, "optional_config", lambda key, default=None: value if key == "CALENDAR_IDS" else default)

    set_ids("primary")
    return set_ids


def ev(summary, start, end, **extra):
    return {"id": summary.lower(), "iCalUID": f"{summary}@google.com", "summary": summary, "start": start, "end": end, **extra}


def test_timed_event_with_offset(tz):
    event = normalize_event(
        ev("Standup", {"dateTime": "2026-10-17T09:00:00-07:00"}, {"dateTime": "2026-10-17T09:15:00-07:00"}, location="Zoom "),
        "Work",
        tz,
    )
    assert event.title == "Standup" and event.location == "Zoom" and event.calendar == "Work"
    assert event.start == datetime(2026, 10, 17, 9, 0, tzinfo=tz) and not event.all_day
    assert event.start.utcoffset() == timedelta(hours=-7)


def test_utc_z_timestamps_become_local(tz):
    event = normalize_event(ev("Call", {"dateTime": "2026-10-17T17:30:00Z"}, {"dateTime": "2026-10-17T18:00:00Z"}), "", tz)
    assert (event.start.hour, event.start.minute) == (10, 30)
    assert event.start.tzinfo == tz


def test_all_day_event(tz):
    event = normalize_event(ev("PS3 due", {"date": "2026-10-17"}, {"date": "2026-10-18"}), "", tz)
    assert event.all_day
    assert event.start == datetime(2026, 10, 17, tzinfo=tz)
    assert event.end == datetime(2026, 10, 18, tzinfo=tz)


@pytest.mark.parametrize(
    "extra",
    [
        {"status": "cancelled"},
        {"eventType": "workingLocation"},
        {"attendees": [{"email": "me@x.com", "self": True, "responseStatus": "declined"}]},
    ],
)
def test_skipped_events(tz, extra):
    raw = ev("Skip me", {"dateTime": "2026-10-17T09:00:00-07:00"}, {"dateTime": "2026-10-17T10:00:00-07:00"}, **extra)
    assert normalize_event(raw, "", tz) is None


def test_declined_by_someone_else_is_kept(tz):
    raw = ev(
        "Keep",
        {"dateTime": "2026-10-17T09:00:00-07:00"},
        {"dateTime": "2026-10-17T10:00:00-07:00"},
        attendees=[{"email": "other@x.com", "responseStatus": "declined"}, {"email": "me@x.com", "self": True, "responseStatus": "accepted"}],
    )
    assert normalize_event(raw, "", tz) is not None


def test_untitled_event(tz):
    raw = {"start": {"dateTime": "2026-10-17T09:00:00-07:00"}, "end": {"dateTime": "2026-10-17T10:00:00-07:00"}}
    assert normalize_event(raw, "", tz).title == "(no title)"


def test_pagination_and_today_window(now, calendar_ids):
    session = FakeSession({
        "/calendars/primary/events": [
            {"items": [ev("Late", {"dateTime": "2026-10-17T20:00:00-07:00"}, {"dateTime": "2026-10-17T21:00:00-07:00"})], "nextPageToken": "1"},
            {"items": [ev("Early", {"dateTime": "2026-10-17T08:00:00-07:00"}, {"dateTime": "2026-10-17T09:00:00-07:00"})]},
        ]
    })
    events = fetch_todays_events(now, session=session)
    assert [event.title for event in events] == ["Early", "Late"]

    (url, params), (_, second) = session.requests
    assert params["timeMin"] == "2026-10-17T00:00:00-07:00"
    assert params["timeMax"] == "2026-10-18T00:00:00-07:00"
    assert params["singleEvents"] == "true" and params["orderBy"] == "startTime"
    assert "pageToken" not in params and second["pageToken"] == "1"


def test_all_calendars(now, calendar_ids):
    calendar_ids("all")
    shared = ev("Group project", {"dateTime": "2026-10-17T15:00:00-07:00"}, {"dateTime": "2026-10-17T16:00:00-07:00"})
    session = FakeSession({
        "/users/me/calendarList": [{"items": [
            {"id": "me@gmail.com", "summary": "me@gmail.com", "summaryOverride": "Personal"},
            {"id": "uw#classes@group.calendar.google.com", "summary": "UW classes"},
            {"id": "boss@x.com", "summary": "Boss", "accessRole": "freeBusyReader"},
            {"id": "old@x.com", "summary": "Old", "hidden": True},
        ]}],
        "/calendars/me%40gmail.com/events": [{"items": [shared]}],
        "/calendars/uw%23classes%40group.calendar.google.com/events": [{"items": [
            shared,  # the same invite on two calendars: kept once
            ev("Midterm", {"dateTime": "2026-10-17T14:30:00-07:00"}, {"dateTime": "2026-10-17T15:20:00-07:00"}),
            ev("PS3 due", {"date": "2026-10-17"}, {"date": "2026-10-18"}),
        ]}],
    })
    events = fetch_todays_events(now, session=session)
    assert [(event.title, event.calendar) for event in events] == [
        ("PS3 due", "UW classes"),
        ("Midterm", "UW classes"),
        ("Group project", "Personal"),
    ]
    assert not any("boss" in url or "old" in url for url, _ in session.requests)


def test_comma_separated_ids(now, calendar_ids):
    calendar_ids("primary, work@x.com")
    session = FakeSession({"/calendars/primary/events": [{"items": []}], "/calendars/work%40x.com/events": [{"items": []}]})
    assert fetch_todays_events(now, session=session) == []
    assert len(session.requests) == 2


def test_api_not_enabled_error_is_readable(now, calendar_ids):
    body = {"error": {"code": 403, "message": "Google Calendar API has not been used in project 123", "errors": [{"reason": "accessNotConfigured"}]}}
    with pytest.raises(CalendarError, match="Enable"):
        fetch_todays_events(now, session=FakeSession(body, status=403))


def test_unknown_calendar_error_names_it(now, calendar_ids):
    calendar_ids("nope@x.com")
    with pytest.raises(CalendarError, match="nope@x.com"):
        fetch_todays_events(now, session=FakeSession({"error": {"message": "Not Found"}}, status=404))


def test_missing_credentials_explains_setup(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "CREDENTIALS_FILE", tmp_path / "credentials.json")
    monkeypatch.setattr(auth, "TOKEN_FILE", tmp_path / "token.json")
    with pytest.raises(auth.AuthError, match="Calendar API"):
        auth.get_session()


def test_other_timezone_now_converts_events():
    tokyo = timezone(timedelta(hours=9))
    event = normalize_event(ev("Call", {"dateTime": "2026-10-17T01:00:00Z"}, {"dateTime": "2026-10-17T02:00:00Z"}), "", tokyo)
    assert event.start.hour == 10 and event.start.tzinfo == tokyo
