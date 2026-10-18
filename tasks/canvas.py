"""Canvas (canvas.uw.edu) planner items → Task.

Needs CANVAS_SESSION_COOKIE (UW blocks personal access tokens) or CANVAS_TOKEN in .env,
and optionally CANVAS_BASE_URL. Manual test: python -m tasks.canvas
"""

import json
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests

from models import Task
from mom.config import fail, optional_config

try:
    # Same as mom/elevenlabs.py: verify HTTPS with the OS certificate store.
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # Python < 3.10, or not installed
    pass

DEFAULT_BASE_URL = "https://canvas.uw.edu"
DAYS_AHEAD = 14
TIMEOUT_SECS = 15
MAX_PAGES = 20  # 50 items per page; stops a broken Link header from looping forever

# "MATH 208 B Au 26: Matrix Algebra" → "MATH 208". Also "A A 210", "B CUSP 110".
COURSE_CODE = re.compile(r"^([A-Z&]+(?: [A-Z&]+)*) (\d{3})\b")

TOKEN_HELP = "canvas.uw.edu → Account → Settings → Approved Integrations → + New Access Token"
COOKIE_HELP = (
    "Chrome → canvas.uw.edu (logged in) → Cmd+Option+I → Application → Cookies → "
    "https://canvas.uw.edu → canvas_session → copy its Value into CANVAS_SESSION_COOKIE in .env"
)
OFF_MESSAGE = "Canvas isn't connected. Set CANVAS_SESSION_COOKIE in .env (steps in .env.example)."


class CanvasError(Exception):
    """A readable reason the Canvas sync failed. Never contains the token or cookie."""


def is_configured():
    return _auth()[0] is not None


def fetch_canvas_tasks():
    """Unsubmitted Canvas items due from today 00:00 to today + 14 days. Raises CanvasError."""
    auth_headers, auth_kind = _auth()
    if auth_headers is None:
        raise CanvasError(f"Canvas isn't connected. {COOKIE_HELP}")
    base_url = _base_url()

    today = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
    params = {
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=DAYS_AHEAD)).isoformat(),
        "filter": "incomplete_items",
        "per_page": 50,
    }

    items = []
    url = f"{base_url}/api/v1/planner/items"
    for _ in range(MAX_PAGES):
        response = _get(url, auth_headers, auth_kind, params)
        items += _parse_json(response)
        url = response.links.get("next", {}).get("url")
        # The next link already carries the query. Never send the login to another host.
        if not url or not url.startswith(base_url + "/"):
            break
        params = None

    tasks = [task for task in (_to_task(item, base_url) for item in items) if task]
    return sorted(tasks, key=lambda task: (task.due_at is None, task.due_at or today))


def _auth():
    """(headers, "token" | "cookie") for the login in .env, or (None, None). A token wins."""
    token = optional_config("CANVAS_TOKEN")
    if token:
        return {"Authorization": f"Bearer {token}"}, "token"
    cookie = optional_config("CANVAS_SESSION_COOKIE")
    if cookie:
        # A raw header, so requests sends the value exactly as copied from the browser.
        return {"Cookie": f"canvas_session={cookie}"}, "cookie"
    return None, None


def _login_expired(auth_kind):
    if auth_kind == "cookie":
        return CanvasError(f"Canvas login cookie expired or is wrong. Copy it again: {COOKIE_HELP}")
    return CanvasError(f"Canvas token is wrong or expired. Make a new one at {TOKEN_HELP}")


def _base_url():
    return optional_config("CANVAS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _get(url, auth_headers, auth_kind, params):
    try:
        response = requests.get(
            url,
            params=params,
            headers={**auth_headers, "Accept": "application/json"},
            timeout=TIMEOUT_SECS,
            allow_redirects=False,  # an expired cookie can redirect to the login page
        )
    except requests.exceptions.InvalidHeader:
        # requests puts the header value (the token / cookie) in this message, so don't pass it on.
        name = "CANVAS_TOKEN" if auth_kind == "token" else "CANVAS_SESSION_COOKIE"
        raise CanvasError(f"{name} has spaces or odd characters. Copy it again.")
    except requests.exceptions.Timeout:
        raise CanvasError(f"Canvas didn't answer within {TIMEOUT_SECS}s. Check your internet / VPN.")
    except requests.exceptions.RequestException:
        raise CanvasError(f"Couldn't reach Canvas ({_base_url()}). Check your internet / VPN and CANVAS_BASE_URL.")

    status = response.status_code
    if status == 401 or 300 <= status < 400:
        raise _login_expired(auth_kind)
    if status == 403:
        raise CanvasError("Canvas said 403 Forbidden: this token can't read your planner.")
    if status == 404:
        raise CanvasError(f"Canvas said 404 Not Found. Check CANVAS_BASE_URL ({_base_url()}).")
    if status == 429:
        raise CanvasError("Canvas is rate limiting us (429). Wait a minute.")
    if status >= 500:
        raise CanvasError(f"Canvas server error ({status}). Probably on their side; retry in a minute.")
    if not response.ok:
        raise CanvasError(f"Canvas returned HTTP {status}.")
    return response


def _parse_json(response):
    # Canvas can prefix JSON with "while(1);" to stop JSON hijacking.
    text = response.text.lstrip()
    if text.startswith("while(1);"):
        text = text[len("while(1);"):]
    try:
        body = json.loads(text)
    except ValueError:
        raise CanvasError("Canvas sent something that isn't JSON. Is CANVAS_BASE_URL right?")
    if not isinstance(body, list):
        raise CanvasError("Canvas sent an unexpected planner response (not a list).")
    return body


def _to_task(item, base_url):
    """One planner item → Task, or None to skip it (submitted, done, or not a task)."""
    if not isinstance(item, dict):
        return None
    kind = item.get("plannable_type") or "item"
    if kind == "announcement":
        return None
    submissions = item.get("submissions")
    if isinstance(submissions, dict) and submissions.get("submitted"):
        return None
    if (item.get("planner_override") or {}).get("marked_complete"):
        return None

    plannable = item.get("plannable") or {}
    points = plannable.get("points_possible")
    html_url = item.get("html_url")
    return Task(
        id=f"canvas:{kind}:{item.get('plannable_id') or plannable.get('id')}",
        source="canvas",
        title=plannable.get("title") or plannable.get("name") or "(untitled)",
        context=_course_code(item.get("context_name") or ""),
        due_at=_parse_time(plannable.get("due_at")) or _parse_time(item.get("plannable_date")),
        url=urljoin(base_url + "/", html_url) if html_url else None,
        points=float(points) if isinstance(points, (int, float)) else None,
    )


def _course_code(context_name):
    match = COURSE_CODE.match(context_name.strip())
    return f"{match.group(1)} {match.group(2)}" if match else context_name.strip()


def _parse_time(value):
    """Canvas ISO 8601 ("2026-10-23T06:59:59Z") → aware datetime in local time, or None."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone()


def _until(due_at, now):
    """Short relative time: "in 2d 5h", "in 45m", "3h ago"."""
    seconds = int((due_at - now).total_seconds())
    minutes = abs(seconds) // 60
    days, hours, mins = minutes // 1440, minutes // 60 % 24, minutes % 60
    if days:
        text = f"{days}d {hours}h"
    elif hours:
        text = f"{hours}h {mins}m"
    else:
        text = f"{mins}m"
    return f"in {text}" if seconds >= 0 else f"{text} ago"


def main():
    if not is_configured():
        fail(f"Canvas isn't connected. Set CANVAS_SESSION_COOKIE in .env:\n   {COOKIE_HELP}")
    try:
        tasks = fetch_canvas_tasks()
    except CanvasError as exc:
        fail(str(exc))

    now = datetime.now().astimezone()
    print(f"Canvas ({_base_url()}): {len(tasks)} unsubmitted, due in the next {DAYS_AHEAD} days\n")
    for task in tasks:
        if task.due_at:
            due = f"{_until(task.due_at, now):<12} {task.due_at:%a %b %d %I:%M %p}"
        else:
            due = "no due date"
        points = f"{task.points:g} pts" if task.points is not None else ""
        print(f"  {task.context:<10}  {task.title[:44]:<44}  {due:<32}  {points}")


if __name__ == "__main__":
    main()
