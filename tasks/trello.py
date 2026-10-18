"""Trello cards → Task, from the one board in TRELLO_BOARD_ID. Read-only.

Setup (the token only gets the "read" scope; it works on every board of the account, so never give it "write"):
  1. trello.com/apps/admin → New → any name, your workspace, "doesn't use Power-Up capabilities"
     → Trello Auth tab → Generate a new API Key → TRELLO_API_KEY in .env.
     Don't click the "Token" link next to the key: that token can also write.
  2. Open this (logged in, with your key in it) → Allow → copy the token → TRELLO_TOKEN in .env:
     https://trello.com/1/authorize?expiration=30days&name=Mom.exe&scope=read&response_type=token&key=YOUR_API_KEY
  3. TRELLO_BOARD_ID = the short id in the board URL (trello.com/b/<id>/...).
     Optional TRELLO_LIST_IDS (comma-separated): find them with python -m tasks.trello --lists

Only each card's name, due, dueComplete and url are requested: never descriptions, attachments or comments.
Manual test: python -m tasks.trello [--lists]
"""

import re
import sys
from datetime import datetime

import requests

from models import Task
from mom.config import fail, optional_config

try:
    # Same as mom/elevenlabs.py: verify HTTPS with the OS certificate store.
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # Python < 3.10, or not installed
    pass

API_BASE = "https://api.trello.com/1"
TIMEOUT_SECS = 15
CARD_FIELDS = "name,due,dueComplete,url"  # never desc, attachments or comments
BOARD_ID = re.compile(r"^[A-Za-z0-9]{8}$|^[0-9a-f]{24}$")  # short id from the URL, or the full id
LIST_ID = re.compile(r"^[0-9a-f]{24}$")
SETUP_HELP = "See the top of tasks/trello.py for how to get TRELLO_API_KEY and TRELLO_TOKEN."


class TrelloError(Exception):
    """A readable reason the Trello sync failed. Never contains the key or token."""


def is_configured():
    return all(_settings()[:3])


def fetch_trello_tasks():
    """Open cards on TRELLO_BOARD_ID that aren't marked complete. Raises TrelloError."""
    key, token, board_id, list_ids = _settings()
    if not (key and token and board_id):
        raise TrelloError(f"Trello isn't connected. {SETUP_HELP}")
    _check_board_id(board_id)
    for list_id in list_ids:
        if not LIST_ID.match(list_id):
            raise TrelloError("TRELLO_LIST_IDS has an invalid list id. Copy ids from: python -m tasks.trello --lists")

    # One request: the board's open lists, each with its open cards (only the fields above).
    lists = _get(
        f"/boards/{board_id}/lists",
        key,
        token,
        {"filter": "open", "fields": "name", "cards": "open", "card_fields": CARD_FIELDS},
        board_id=board_id,
    )
    if not isinstance(lists, list):
        raise TrelloError("Trello sent an unexpected response for the board's lists.")

    if list_ids:
        missing = set(list_ids) - {lst.get("id") for lst in lists}
        if missing:
            raise TrelloError(
                f"{len(missing)} id(s) in TRELLO_LIST_IDS aren't open lists on board {board_id}. "
                "Check them with: python -m tasks.trello --lists"
            )
        lists = [lst for lst in lists if lst.get("id") in list_ids]
    else:
        lists = [lst for lst in lists if not _skipped_by_default(lst.get("name") or "")]

    tasks = []
    for lst in lists:
        for card in lst.get("cards") or []:
            task = _to_task(card, lst.get("name") or "Trello")
            if task:
                tasks.append(task)
    return sorted(tasks, key=lambda task: (task.due_at is None, task.due_at.timestamp() if task.due_at else 0))


def _settings():
    """(key, token, board_id, list_ids). Unset or placeholder values are None / []."""
    list_ids = optional_config("TRELLO_LIST_IDS", "")
    return (
        optional_config("TRELLO_API_KEY"),
        optional_config("TRELLO_TOKEN"),
        optional_config("TRELLO_BOARD_ID"),
        [part.strip() for part in list_ids.split(",") if part.strip()],
    )


def _check_board_id(board_id):
    # Also keeps a typo from turning into a request for some other Trello resource.
    if not BOARD_ID.match(board_id):
        raise TrelloError(
            "TRELLO_BOARD_ID should be the short id from the board URL (trello.com/b/<id>/...), "
            "e.g. ggif6Zbx. Find yours with: python -m tasks.trello --lists"
        )


def _skipped_by_default(list_name):
    name = list_name.strip().lower()
    return name.startswith("done") or name == "getting started"


def _get(path, key, token, params=None, board_id=None):
    """GET API_BASE + path with the key and token in a header, so they're never in a URL or log."""
    headers = {
        "Authorization": f'OAuth oauth_consumer_key="{key}", oauth_token="{token}"',
        "Accept": "application/json",
    }
    try:
        response = requests.get(API_BASE + path, params=params, headers=headers, timeout=TIMEOUT_SECS)
    except requests.exceptions.InvalidHeader:
        # requests puts the header value (key and token) in this message, so don't pass it on.
        raise TrelloError("TRELLO_API_KEY or TRELLO_TOKEN has spaces or odd characters. Copy it again.")
    except requests.exceptions.Timeout:
        raise TrelloError(f"Trello didn't answer within {TIMEOUT_SECS}s. Check your internet.")
    except requests.exceptions.RequestException:
        # Never include the exception text: it can contain the request URL.
        raise TrelloError("Couldn't reach api.trello.com. Check your internet.")

    status = response.status_code
    body = response.text[:200].lower()
    if status == 400 and board_id and "invalid id" in body:
        raise TrelloError(f"Trello doesn't know board {board_id}. Check TRELLO_BOARD_ID (python -m tasks.trello --lists).")
    if status == 401:
        if "invalid key" in body:
            # Trello also says "invalid key" when the token wasn't made with this key (e.g. the Secret was used).
            raise TrelloError(
                "Trello rejected TRELLO_API_KEY + TRELLO_TOKEN. Check the key, and that the token came from "
                f"the scope=read authorize link with that key (not the Secret). {SETUP_HELP}"
            )
        if "token" in body:
            raise TrelloError(f"Trello says TRELLO_TOKEN is wrong, expired or revoked. Make a new one. {SETUP_HELP}")
        where = f"board {board_id}" if board_id else "this"
        raise TrelloError(f"This Trello token can't see {where}. Make the token with the account that owns the board.")
    if status == 404:
        where = f"Board {board_id}" if board_id else "That Trello resource"
        raise TrelloError(f"{where} wasn't found, or this account can't see it. Check TRELLO_BOARD_ID.")
    if status == 429:
        raise TrelloError("Trello is rate limiting us (429). Wait a minute.")
    if status >= 500:
        raise TrelloError(f"Trello server error ({status}). Probably on their side; retry in a minute.")
    if not response.ok:
        raise TrelloError(f"Trello returned HTTP {status}.")
    try:
        return response.json()
    except ValueError:
        raise TrelloError("Trello sent something that isn't JSON.")


def _to_task(card, list_name):
    """One card → Task, or None if it's marked complete."""
    if not isinstance(card, dict) or card.get("dueComplete"):
        return None
    return Task(
        id=f"trello:card:{card.get('id')}",
        source="trello",
        title=card.get("name") or "(untitled)",
        context=list_name.strip(),
        due_at=_parse_time(card.get("due")),
        url=card.get("url"),
    )


def _parse_time(value):
    """Trello ISO 8601 ("2026-10-19T19:00:00.000Z") → aware datetime in local time, or None."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone()


def _token_can_write(key, token):
    """True / False from Trello's own record of the token's permissions, None if it can't tell."""
    try:
        info = _get(f"/tokens/{token}", key, token, {"fields": "permissions"})
    except TrelloError:
        return None
    permissions = info.get("permissions") if isinstance(info, dict) else None
    if not isinstance(permissions, list):
        return None
    return any(isinstance(p, dict) and p.get("write") for p in permissions)


def _print_token_scope(key, token):
    can_write = _token_can_write(key, token)
    if can_write:
        print("⚠️  This token can WRITE to all your boards. Revoke it (trello.com → your profile → Settings →")
        print("   Applications) and make a read-only one with the scope=read link in tasks/trello.py.\n")
    elif can_write is False:
        print("Token: read-only ✅\n")


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


def print_boards(key, token, current_board_id=None):
    """Every open board's name and id, with its open lists' names and ids. Never card contents."""
    boards = _get("/members/me/boards", key, token, {"filter": "open", "fields": "name,shortLink", "lists": "open"})
    if not isinstance(boards, list) or not boards:
        print("No open Trello boards on this account.")
        return

    print(f"Found {len(boards)} open board(s):\n")
    for board in boards:
        current = board.get("shortLink") == current_board_id or board.get("id") == current_board_id
        print(f"• {board.get('name')}{'   ← TRELLO_BOARD_ID' if current else ''}")
        print(f"    board id : {board.get('shortLink')}")
        for lst in board.get("lists") or []:
            note = "   (skipped unless listed in TRELLO_LIST_IDS)" if _skipped_by_default(lst.get("name") or "") else ""
            print(f"    list     : {lst.get('id')}  {lst.get('name')}{note}")
        print()

    print("👉 Put a board id in TRELLO_BOARD_ID in .env.")
    print("   Optional: only read some of its lists with TRELLO_LIST_IDS=<list id>,<list id>")


def main():
    key, token, board_id, list_ids = _settings()
    if not (key and token):
        fail(f"TRELLO_API_KEY and TRELLO_TOKEN aren't both set in .env.\n   {SETUP_HELP}")

    try:
        if "--lists" in sys.argv[1:]:
            _print_token_scope(key, token)
            print_boards(key, token, board_id)
            return
        if not board_id:
            fail("TRELLO_BOARD_ID isn't set in .env.\n   Find your board id with: python -m tasks.trello --lists")
        _print_token_scope(key, token)
        tasks = fetch_trello_tasks()
    except TrelloError as exc:
        fail(str(exc))

    now = datetime.now().astimezone()
    which = f"lists {', '.join(list_ids)}" if list_ids else "all open lists except Done* and Getting Started"
    print(f"Trello board {board_id} ({which}): {len(tasks)} open card(s)\n")
    for task in tasks:
        if task.due_at:
            due = f"{_until(task.due_at, now):<12} {task.due_at:%a %b %d %I:%M %p}"
        else:
            due = "no due date"
        print(f"  {task.context[:14]:<14}  {task.title[:50]:<50}  {due}")


if __name__ == "__main__":
    main()
