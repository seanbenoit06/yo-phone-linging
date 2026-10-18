"""Task sources (Canvas now; Trello / Calendar later) → list[Task] for the dashboard.

get_tasks() caches each source for 5 minutes and never raises. Each source is imported
lazily and has its own try/except, so a missing or broken source never breaks the others.

To add a source: create tasks/<name>.py with a fetch function that returns list[Task] and
raises with a readable message (no secrets) on failure, then add one line to SOURCES.
Optionally add is_configured() -> bool; when it returns False the source shows as "off",
with the module's OFF_MESSAGE (how to connect it) if it defines one.
"""

import importlib
import threading
import time
from datetime import datetime

SOURCES = {
    "canvas": "tasks.canvas:fetch_canvas_tasks",
    "trello": "tasks.trello:fetch_trello_tasks",
    "calendar": "tasks.calendar:fetch_calendar_tasks",
}

CACHE_SECS = 5 * 60
ERROR_RETRY_SECS = 60  # a failed source is retried sooner than a healthy one is refreshed
SOURCE_CACHE_SECS = {"calendar": 60}  # new meetings should show up within a minute

_cache = {}  # name → (expires_at monotonic, tasks, status)
_lock = threading.Lock()  # api.py serves requests on threads; fetch each source once


def get_tasks():
    """Return (tasks sorted by due_at, {source: {"status", "synced_at", "message"}})."""
    with _lock:
        tasks, statuses = [], {}
        for name in SOURCES:
            source_tasks, statuses[name] = _cached(name)
            tasks += source_tasks
    tasks.sort(key=lambda task: (task.due_at is None, task.due_at.timestamp() if task.due_at else 0))
    return tasks, statuses


def clear_cache():
    with _lock:
        _cache.clear()


def forget(name):
    """Drop one source's cache, so the next get_tasks() fetches it again (the dashboard's refresh button)."""
    with _lock:
        _cache.pop(name, None)


def _cached(name):
    now = time.monotonic()
    hit = _cache.get(name)
    if hit and hit[0] > now:
        return hit[1], hit[2]

    try:
        module_path, func_name = SOURCES[name].split(":")
        module = importlib.import_module(module_path)
        fetch = getattr(module, func_name)
    except Exception as exc:
        return [], _status("error", message=f"tasks/{name}.py failed to load ({type(exc).__name__}).")

    try:
        is_configured = getattr(module, "is_configured", None)
        if is_configured and not is_configured():
            # Cheap check, so it isn't cached: a login added later shows up on the next call.
            message = getattr(module, "OFF_MESSAGE", None) or f"{name} isn't connected."
            return [], _status("off", message=message)
        tasks = list(fetch())
        status, ttl = _status("ok", synced_at=datetime.now().astimezone()), SOURCE_CACHE_SECS.get(name, CACHE_SECS)
    except Exception as exc:
        tasks, ttl = [], ERROR_RETRY_SECS
        # Errors raised by our source modules are readable and secret-free; anything else is a bug.
        ours = type(exc).__module__.startswith("tasks.")
        message = str(exc) if ours else f"Unexpected error reading {name} ({type(exc).__name__})."
        status = _status("error", message=message)

    _cache[name] = (now + ttl, tasks, status)
    return tasks, status


def _status(status, synced_at=None, message=None):
    return {"status": status, "synced_at": synced_at, "message": message}
