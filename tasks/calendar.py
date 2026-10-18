"""Google Calendar events → Task, for the next 7 days. Read-only.

Reuses the calendar feature in mom/calendar (CALENDAR_IDS, event normalizing, token.json),
so the dashboard and the daily briefing read the same calendars.

Never opens a browser: the dashboard fetches tasks in the background, so a sign-in page
popping up mid-demo would be bad. Sign in once in a terminal instead (it saves token.json):
    python -m mom.calendar.gcal

Manual test: python -m tasks.calendar
"""

from datetime import datetime, timedelta

from models import Task
from mom.config import fail

LOOKAHEAD_DAYS = 7
SIGN_IN_HELP = "Sign in once in a terminal: python -m mom.calendar.gcal (it opens your browser)."
OFF_MESSAGE = f"Google Calendar isn't connected. {SIGN_IN_HELP}"


class CalendarSourceError(Exception):
    """A readable reason the calendar sync failed. Never contains tokens."""


def is_configured():
    from mom.calendar.auth import TOKEN_FILE

    return TOKEN_FILE.exists()


def fetch_calendar_tasks():
    """Events from now until LOOKAHEAD_DAYS ahead, one Task each. Raises CalendarSourceError."""
    from mom.calendar import gcal

    now = datetime.now().astimezone()
    window_end = now + timedelta(days=LOOKAHEAD_DAYS)
    session = _session()

    try:
        found = [
            (raw, calendar_name)
            for calendar_id, calendar_name in gcal._calendars(session)
            for raw in gcal._list_events(session, calendar_id, now, window_end)
        ]
    except gcal.CalendarError as err:
        raise CalendarSourceError(str(err)) from None

    # Same rules as the daily briefing: skip declined meetings and duplicates across calendars.
    declined = {gcal._event_key(raw) for raw, _ in found if gcal._declined(raw)}
    tasks, seen = [], set()
    for raw, calendar_name in found:
        key = gcal._event_key(raw)
        if key in declined or key in seen:
            continue
        event = gcal.normalize_event(raw, calendar_name, now.tzinfo)
        if event is None or event.end <= now:
            continue
        seen.add(key)
        tasks.append(_to_task(key, event))
    return tasks


def _to_task(key, event):
    # All-day events (often deadlines) are due at the end of their last day, not at midnight,
    # so today's all-day event doesn't show up as overdue.
    due_at = event.end - timedelta(minutes=1) if event.all_day else event.start
    event_id, start = key
    return Task(
        id=f"calendar:{event_id}:{start}",
        source="calendar",
        title=event.title,
        context=event.calendar or "Calendar",
        due_at=due_at,
        url=None,
    )


def _session():
    """An authorized session from token.json, refreshed if needed. Never starts a browser sign-in."""
    from google.auth.exceptions import RefreshError, TransportError
    from google.auth.transport.requests import AuthorizedSession, Request
    from google.oauth2.credentials import Credentials

    from mom.calendar.auth import SCOPES, TOKEN_FILE

    if not TOKEN_FILE.exists():
        raise CalendarSourceError(f"Google Calendar isn't connected. {SIGN_IN_HELP}")
    try:
        credentials = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    except ValueError:
        raise CalendarSourceError(f"token.json is unreadable. {SIGN_IN_HELP}") from None

    if not credentials.valid:
        if not credentials.refresh_token:
            raise CalendarSourceError(f"Your Google sign-in expired. {SIGN_IN_HELP}")
        try:
            credentials.refresh(Request())
        except RefreshError:
            # Apps in Google's "Testing" mode get refresh tokens that expire after 7 days.
            raise CalendarSourceError(f"Your Google sign-in expired (every 7 days in Testing). {SIGN_IN_HELP}") from None
        except TransportError:
            raise CalendarSourceError("Couldn't reach Google to refresh your sign-in. Check your internet.") from None
        TOKEN_FILE.write_text(credentials.to_json(), encoding="utf-8")
    return AuthorizedSession(credentials)


def main():
    if not is_configured():
        fail(f"Google Calendar isn't connected. {SIGN_IN_HELP}")
    try:
        tasks = fetch_calendar_tasks()
    except CalendarSourceError as err:
        fail(str(err))
    print(f"{len(tasks)} calendar event(s) in the next {LOOKAHEAD_DAYS} days:\n")
    for task in tasks:
        print(f"  {task.due_at:%a %b %d %I:%M %p}  [{task.context}]  {task.title}")


if __name__ == "__main__":
    main()
