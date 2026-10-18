"""Fetch today's events from Google Calendar (REST API, read-only).

Manual check, no call:
    python -m mom.calendar.gcal
"""

from datetime import date, datetime, time, timedelta

import requests

from mom.calendar.events import CalendarEvent
from mom.config import fail, optional_config

API_BASE = "https://www.googleapis.com/calendar/v3"
TIMEOUT_SECS = 30
# Event types that aren't things you have to do (Google's "Home / Office" location chips).
IGNORED_EVENT_TYPES = {"workingLocation"}


class CalendarError(Exception):
    """A Calendar API request failed. The message is ready to show the user."""


def fetch_todays_events(now: datetime, session=None) -> list[CalendarEvent]:
    """All events overlapping today's local date, from CALENDAR_IDS, sorted by start.

    session is a requests-style session (tests pass a fake). By default it's the
    signed-in Google session from mom.calendar.auth.
    """
    if now.tzinfo is None:
        raise ValueError("fetch_todays_events needs a timezone-aware now, e.g. datetime.now().astimezone()")
    if session is None:
        from mom.calendar.auth import get_session

        session = get_session()

    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    found = [
        (raw, calendar_name)
        for calendar_id, calendar_name in _calendars(session)
        for raw in _list_events(session, calendar_id, day_start, day_end)
    ]
    # A meeting you declined can still show up through someone else's shared calendar.
    declined = {_event_key(raw) for raw, _ in found if _declined(raw)}

    events = []
    seen = set()
    for raw, calendar_name in found:
        key = _event_key(raw)
        # The same meeting shows up once per calendar it's on; keep one.
        if key in declined or key in seen:
            continue
        event = normalize_event(raw, calendar_name, now.tzinfo)
        if event is None or not (event.start < day_end and event.end > day_start):
            continue
        seen.add(key)
        events.append(event)

    return sorted(events, key=lambda event: (event.start, not event.all_day, event.title))


def _event_key(raw):
    """Same meeting on several calendars = same key. Recurring instances differ by start."""
    start = raw.get("originalStartTime") or raw.get("start") or {}
    return raw.get("iCalUID") or raw.get("id"), start.get("dateTime") or start.get("date")


def _declined(raw):
    return any(a.get("self") and a.get("responseStatus") == "declined" for a in raw.get("attendees") or [])


def normalize_event(raw, calendar_name, tz):
    """Turn one Calendar API event into a CalendarEvent, or None if it should be skipped."""
    if raw.get("status") == "cancelled" or raw.get("eventType") in IGNORED_EVENT_TYPES or _declined(raw):
        return None

    start, end = raw.get("start") or {}, raw.get("end") or {}
    if "date" in start:
        all_day = True
        start_at = datetime.combine(date.fromisoformat(start["date"]), time(), tzinfo=tz)
        end_date = date.fromisoformat(end["date"]) if "date" in end else start_at.date() + timedelta(days=1)
        end_at = datetime.combine(end_date, time(), tzinfo=tz)
    elif "dateTime" in start:
        all_day = False
        start_at = _parse_datetime(start["dateTime"]).astimezone(tz)
        end_at = _parse_datetime(end["dateTime"]).astimezone(tz) if "dateTime" in end else start_at
    else:
        return None

    return CalendarEvent(
        title=(raw.get("summary") or "").strip() or "(no title)",
        start=start_at,
        end=end_at,
        all_day=all_day,
        location=(raw.get("location") or "").strip(),
        calendar=calendar_name,
    )


def _parse_datetime(value):
    # Python 3.10's fromisoformat can't parse a trailing "Z".
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _calendars(session):
    """[(calendar_id, display_name)] from CALENDAR_IDS: comma-separated IDs, or "all"."""
    setting = optional_config("CALENDAR_IDS", "primary")
    if setting.strip().lower() != "all":
        ids = [calendar_id.strip() for calendar_id in setting.split(",") if calendar_id.strip()]
        # No display names without an extra request per calendar; they're optional.
        return [(calendar_id, "") for calendar_id in ids or ["primary"]]

    calendars = []
    for item in _get_pages(session, "/users/me/calendarList", {}):
        # Free/busy-only calendars have no titles to read out; hidden or unchecked ones
        # (in Google Calendar's sidebar) you chose not to see.
        if item.get("accessRole") == "freeBusyReader" or item.get("hidden"):
            continue
        if not item.get("selected") and not item.get("primary"):
            continue
        calendars.append((item["id"], item.get("summaryOverride") or item.get("summary") or item["id"]))
    return calendars


def _list_events(session, calendar_id, day_start, day_end):
    params = {
        "timeMin": day_start.isoformat(),
        "timeMax": day_end.isoformat(),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "250",
    }
    path = f"/calendars/{requests.utils.quote(calendar_id, safe='')}/events"
    return _get_pages(session, path, params, calendar_id=calendar_id)


def _get_pages(session, path, params, calendar_id=None):
    """GET every page of a list endpoint and yield its items, following nextPageToken."""
    page_token = None
    while True:
        page_params = dict(params, pageToken=page_token) if page_token else params
        body = _get(session, path, page_params, calendar_id)
        for item in body.get("items") or []:
            yield item
        page_token = body.get("nextPageToken")
        if not page_token:
            return


def _get(session, path, params, calendar_id=None):
    from google.auth.exceptions import RefreshError, TransportError

    try:
        response = session.get(API_BASE + path, params=params, timeout=TIMEOUT_SECS)
    except RefreshError as err:
        # The session refreshes on a 401 by itself; this means the sign-in was revoked or expired.
        from mom.calendar.auth import TOKEN_FILE

        TOKEN_FILE.unlink(missing_ok=True)
        raise CalendarError(
            f"Google no longer accepts your sign-in ({err}).\n"
            "   Removed token.json. Run the command again to sign in in your browser."
        )
    except TransportError as err:
        raise CalendarError(f"Couldn't reach Google to refresh your sign-in: {err}\n   Check your internet / VPN.")
    except requests.exceptions.Timeout:
        raise CalendarError(f"Google Calendar didn't answer within {TIMEOUT_SECS}s (timeout).")
    except requests.exceptions.ConnectionError:
        raise CalendarError("Couldn't reach www.googleapis.com. Check your internet / VPN.")

    if not response.ok:
        raise CalendarError(_describe_http_error(response, calendar_id))
    try:
        return response.json()
    except ValueError:
        raise CalendarError(f"Google Calendar returned non-JSON: {response.text[:300]}")


def _describe_http_error(response, calendar_id):
    status = response.status_code
    try:
        error = response.json().get("error") or {}
    except (ValueError, AttributeError):
        error = {}
    message = error.get("message") or response.text[:300] or "(empty response body)"
    reasons = {detail.get("reason") for detail in error.get("errors") or [] if isinstance(detail, dict)}

    if status == 401:
        return (
            f"401 Unauthorized: {message}\n"
            "   Google rejected your sign-in. Delete token.json and run again to sign in fresh."
        )
    if status == 403 and ("accessNotConfigured" in reasons or "SERVICE_DISABLED" in message or "has not been used" in message):
        return (
            f"403: the Google Calendar API isn't enabled for your Cloud project.\n   {message}\n"
            "   Google Cloud console → APIs & Services → Library → Google Calendar API → Enable, then retry."
        )
    if status == 403:
        return (
            f"403 Forbidden: {message}\n"
            "   • Delete token.json and sign in again, and tick the calendar permission.\n"
            "   • Rate limited? Wait a minute and retry."
        )
    if status == 404 and calendar_id:
        return (
            f"404: calendar {calendar_id!r} not found.\n"
            "   Check CALENDAR_IDS in .env (use primary, all, or IDs from Google Calendar → Settings → Integrate calendar)."
        )
    if status == 429 or status >= 500:
        return f"{status} from Google Calendar: {message}\n   Probably temporary. Retry in a minute."
    return f"HTTP {status} from Google Calendar: {message}"


def main():
    import argparse

    from mom.calendar.auth import AuthError
    from mom.calendar.briefing import briefing_time
    from mom.calendar.summary import format_time

    parser = argparse.ArgumentParser(description="Print a day's Google Calendar events (no call).")
    parser.add_argument("--date", metavar="YYYY-MM-DD", help="the day to show (default: today)")
    args = parser.parse_args()
    try:
        now = briefing_time(args.date)
        events = fetch_todays_events(now)
    except ValueError as err:
        fail(str(err))
    except (AuthError, CalendarError) as err:
        fail(str(err))

    print(f"📅 Events on {now.date().isoformat()} ({len(events)}), CALENDAR_IDS={optional_config('CALENDAR_IDS', 'primary')}:")
    if not events:
        print("   (nothing on the calendar that day)")
    for event in events:
        when = "All day" if event.all_day else f"{format_time(event.start)}-{format_time(event.end)}"
        where = f" ({event.location})" if event.location else ""
        calendar = f"  [{event.calendar}]" if event.calendar else ""
        print(f"   {when:<20} {event.title}{where}{calendar}")


if __name__ == "__main__":
    main()
