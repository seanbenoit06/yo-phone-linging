"""Local HTTP API for the web dashboard (web/). Contract: docs/UI_SPEC.md sections 4 and 9.

main.py owns the brain and the loop; this module never touches them:
- GET /api/state and /api/events only read the snapshot and events that main.py publishes
  every loop step. GET /api/tasks calls tasks.get_tasks(), which caches and locks on its own.
- GET /api/logs reads main.py's log lines (log_line). GET /api/settings and
  GET /api/webcam/photo call providers main.py sets (settings_info, photo_source).
- POST commands are validated here, then wait in a queue that main.py drains at the start
  of its next step. The request blocks until main.py replies (or COMMAND_WAIT_SECS pass).

Standard library only. Binds to 127.0.0.1, and rejects requests whose Host or Origin isn't
local, so other people on the Wi-Fi and other websites in your browser can't place calls.
"""

import json
import queue
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import intent
from models import Intent, IntentKind

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_EVENTS = 500
FIRST_PAGE_EVENTS = 200   # GET /api/events?after=0
MAX_LOG_LINES = 1000
FIRST_PAGE_LOG_LINES = 300  # GET /api/logs?after=0
PREVIEW_SECS = 10         # each GET /api/webcam/photo keeps the camera preview running this long
COMMAND_WAIT_SECS = 12    # the dashboard client gives up after 15s
MAX_BODY_BYTES = 16 * 1024
MAX_GOAL_CHARS = 200
MAX_FORCE_SECS = 30 * 60
LOCAL_HOSTNAMES = {"127.0.0.1", "localhost"}
REDACTED = "•••"
START_HINT = 'Tell Mom what you\'re doing and until when, like "CSE homework until 9 PM".'


def iso(moment):
    """ISO 8601 with the local UTC offset, or None. Naive datetimes are local time."""
    return moment.astimezone().isoformat(timespec="seconds") if moment else None


class BadRequest(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class Command:
    """One dashboard button press, handed from an HTTP thread to main.py's loop."""

    def __init__(self, name, payload):
        self.name = name
        self.payload = payload
        self.status = 503
        self.body = {"ok": False, "error": "Mom didn't answer. Try again."}
        self._state = "pending"   # pending → taken → done, or pending → cancelled
        self._lock = threading.Lock()
        self._done = threading.Event()

    def claim(self):
        """main.py: take the command, unless the HTTP side already gave up on it."""
        with self._lock:
            if self._state != "pending":
                return False
            self._state = "taken"
            return True

    def cancel(self):
        """HTTP side: give up, unless main.py already took the command."""
        with self._lock:
            if self._state != "pending":
                return False
            self._state = "cancelled"
            return True

    def reply(self, status, body):
        self.status, self.body = status, body
        self._done.set()

    def wait(self, timeout):
        return self._done.wait(timeout)


class DashboardApi:
    """Shared between main.py's loop (publish / record / take_commands) and the HTTP threads."""

    def __init__(self, redact=()):
        self._lock = threading.Lock()
        self._snapshot = None
        self._events = deque(maxlen=MAX_EVENTS)
        # Seeded from the clock so ids keep increasing across restarts of main.py,
        # and a dashboard that stayed open doesn't miss events after a restart.
        self._last_id = int(time.time() * 1000)
        self._commands = queue.Queue()
        # Phone numbers and API keys. Masked in every response, whatever produced the text.
        self._redact = sorted({s for s in redact if s and len(s) >= 6}, key=len, reverse=True)
        self._logs = deque(maxlen=MAX_LOG_LINES)
        self._last_log_id = self._last_id
        self._preview_until = 0.0  # monotonic
        # Set by main.py: () -> SettingsResponse, and () -> (jpeg bytes or None, reason if None).
        self.settings_info = lambda: {"settings": {}, "available": {}, "unavailable_reason": {}}
        self.photo_source = lambda: (None, "The camera isn't set up.")
        self.server = None

    # ---------- main.py side ----------

    def publish(self, snapshot):
        """Replace the State served by GET /api/state (everything except `now`)."""
        with self._lock:
            self._snapshot = snapshot

    def record(self, kind, summary, data):
        with self._lock:
            self._last_id += 1
            self._events.append({
                "id": self._last_id,
                "at": iso(datetime.now()),
                "kind": kind,
                "summary": summary,
                "data": data,
            })

    def add_redaction(self, secret):
        """Mask one more value (e.g. a guest's phone number) in every response from now on."""
        digits = "".join(ch for ch in secret if ch.isdigit())
        with self._lock:
            values = set(self._redact) | {v for v in (secret, digits, digits[-10:]) if v and len(v) >= 6}
            self._redact = sorted(values, key=len, reverse=True)

    def log_line(self, source, message):
        """One main.py log line, for GET /api/logs. Safe to call from any thread."""
        with self._lock:
            self._last_log_id += 1
            self._logs.append({"id": self._last_log_id, "at": iso(datetime.now()),
                               "source": source, "message": message})

    def preview_wanted(self):
        """True while the dashboard's camera window is open (it polls the photo)."""
        return time.monotonic() < self._preview_until

    def take_commands(self):
        """Every command waiting for the loop, oldest first."""
        commands = []
        while True:
            try:
                command = self._commands.get_nowait()
            except queue.Empty:
                return commands
            if command.claim():
                commands.append(command)

    def serve(self, port=DEFAULT_PORT, host=HOST):
        """Start the HTTP server in a daemon thread. Raises OSError if the port is taken."""
        self.server = ThreadingHTTPServer((host, port), _Handler)
        self.server.daemon_threads = True
        self.server.api = self
        threading.Thread(target=self.server.serve_forever, name="dashboard-api", daemon=True).start()
        return self.server

    # ---------- HTTP side ----------

    def state(self):
        with self._lock:
            snapshot = self._snapshot
        if snapshot is None:
            raise BadRequest("Mom is still waking up. Try again in a second.", status=503)
        return {"now": iso(datetime.now()), **snapshot}

    def events_after(self, after):
        with self._lock:
            if after <= 0:
                return list(self._events)[-FIRST_PAGE_EVENTS:]
            return [event for event in self._events if event["id"] > after]

    def logs_after(self, after):
        with self._lock:
            if after <= 0:
                return list(self._logs)[-FIRST_PAGE_LOG_LINES:]
            return [line for line in self._logs if line["id"] > after]

    def photo(self):
        """GET /api/webcam/photo: the latest JPEG. Also keeps the camera preview running."""
        self._preview_until = time.monotonic() + PREVIEW_SECS
        jpeg, reason = self.photo_source()
        if not jpeg:
            raise BadRequest(reason or "No photo yet.", status=404)
        return jpeg

    def tasks(self):
        """GET /api/tasks. tasks.get_tasks() caches, locks and never raises, so it runs on this thread."""
        try:
            from tasks import get_tasks
            items, sources = get_tasks()
            return {
                "tasks": [_task_json(task) for task in items],
                "sources": {name: _source_json(status) for name, status in sources.items()},
            }
        except Exception as err:  # noqa: BLE001
            # Only the exception type: a message from an HTTP client could echo a token.
            print(f"{datetime.now():%H:%M:%S} [api] tasks failed: {type(err).__name__}", flush=True)
            return {"tasks": [], "sources": {},
                    "error": f"Mom couldn't load your tasks ({type(err).__name__}). Check the terminal."}

    def submit(self, name, payload):
        """Queue a command for main.py and wait for its (status, body)."""
        command = Command(name, payload)
        self._commands.put(command)
        if not command.wait(COMMAND_WAIT_SECS):
            if command.cancel():
                raise BadRequest("Mom is busy (the app loop is stuck on a slow step). Try again.", status=503)
            command.wait(COMMAND_WAIT_SECS)  # main.py took it, so the reply is moments away
        return command.status, command.body

    def encode(self, body):
        text = json.dumps(body, ensure_ascii=False)
        for secret in self._redact:
            text = text.replace(secret, REDACTED)
        return text.encode("utf-8")


def _task_json(task):
    return {"id": task.id, "source": task.source, "title": task.title, "context": task.context,
            "due_at": iso(task.due_at), "url": task.url, "points": task.points}


def _source_json(status):
    body = {"status": status.get("status", "error"), "synced_at": iso(status.get("synced_at"))}
    if status.get("message"):
        body["message"] = status["message"]
    return body


# ---------- request bodies → commands ----------

def _start_session(body):
    text = body.get("text")
    if isinstance(text, str) and text.strip():
        parsed = intent.parse(text.strip(), datetime.now())
        if parsed.kind != IntentKind.START_SESSION:
            raise BadRequest(f"Mom didn't get that. {START_HINT}")
        return "intent", parsed

    goal = body.get("goal")
    if not isinstance(goal, str) or not goal.strip():
        raise BadRequest(f'Send {{"text": "CSE homework until 9 PM"}} or {{"goal": "...", "until": null}}.')
    if len(goal) > MAX_GOAL_CHARS:
        raise BadRequest(f"goal is too long (max {MAX_GOAL_CHARS} characters).")
    return "intent", Intent(kind=IntentKind.START_SESSION, text=goal.strip(),
                            goal=goal.strip(), until=_parse_until(body.get("until")))


def _parse_until(value):
    if value in (None, ""):
        return None
    try:
        until = datetime.fromisoformat(str(value))
    except ValueError:
        raise BadRequest("until must be an ISO time like 2026-10-17T21:00:00-07:00, or null.") from None
    if until.tzinfo:
        until = until.astimezone().replace(tzinfo=None)  # the brain compares with naive local time
    if until <= datetime.now():
        raise BadRequest("until is already in the past.")
    return until


def _force_distracted(body):
    distraction = body.get("distraction", "TikTok")
    if not isinstance(distraction, str) or not distraction.strip():
        raise BadRequest("distraction must be a short label, like \"TikTok\".")
    seconds = body.get("seconds", 60)
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not 1 <= seconds <= MAX_FORCE_SECS:
        raise BadRequest(f"seconds must be a number from 1 to {MAX_FORCE_SECS}.")
    return "force_distracted", {"distraction": distraction.strip()[:60], "seconds": int(seconds)}


GUEST_NAME_MAX = 40
GUEST_GOAL_MAX = 120
GUEST_DISTRACTION_MAX = 40


def _guest_call(body):
    """A judge's own call: their name, number and class. The number is never echoed back."""
    if body.get("consent") is not True:
        raise BadRequest("Tick the box to agree to one call from Mom.exe, an AI.")
    name = body.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > GUEST_NAME_MAX:
        raise BadRequest(f"Enter a name (up to {GUEST_NAME_MAX} characters).")
    if any(ch in name for ch in "{}<>") or not name.isprintable():
        raise BadRequest("Use letters, numbers and spaces in the name.")
    phone = _normalize_phone(body.get("phone"))
    goal = _optional_text(body, "goal", GUEST_GOAL_MAX) or "your homework"
    distraction = _optional_text(body, "distraction", GUEST_DISTRACTION_MAX) or "TikTok"
    return "guest_call", {"name": name.strip(), "phone": phone, "goal": goal, "distraction": distraction}


def _normalize_phone(value):
    """(425) 555-1234, 425-555-1234 or +1 425 555 1234 → +14255551234. US by default."""
    if not isinstance(value, str) or not value.strip():
        raise BadRequest("Enter a phone number, like (425) 555-1234.")
    digits = "".join(ch for ch in value if ch.isdigit())
    if value.strip().startswith("+"):
        if 8 <= len(digits) <= 15 and digits[0] != "0":
            return "+" + digits
    elif len(digits) == 10 and digits[0] not in "01":
        return "+1" + digits
    elif len(digits) == 11 and digits[0] == "1":
        return "+" + digits
    raise BadRequest("Enter a US number like (425) 555-1234, or start with + and the country code.")


def _optional_text(body, key, limit):
    value = body.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or len(value.strip()) > limit or not value.isprintable():
        raise BadRequest(f"{key} must be text up to {limit} characters.")
    return value.strip() or None


COMMANDS = {
    "/api/session/start": _start_session,
    "/api/session/stop": lambda body: ("intent", Intent(kind=IntentKind.STOP_SESSION, text="Done")),
    "/api/not-distracted": lambda body: ("intent", Intent(kind=IntentKind.NOT_DISTRACTED, text="I'm actually working")),
    "/api/test-call": lambda body: ("test_call", None),
    "/api/guest-call": _guest_call,
    "/api/demo/force-distracted": _force_distracted,
    "/api/settings": lambda body: ("settings", body),  # validated by controls.update in the loop
}
GETS = {"/api/state", "/api/events", "/api/tasks", "/api/settings", "/api/logs", "/api/webcam/photo"}


# ---------- HTTP ----------

def _is_local(host_or_origin, is_origin=False):
    try:
        hostname = urlsplit(host_or_origin if is_origin else f"//{host_or_origin}").hostname
    except ValueError:
        return False
    return hostname in LOCAL_HOSTNAMES


class _Handler(BaseHTTPRequestHandler):
    server_version = "MomExe"

    def do_OPTIONS(self):  # noqa: N802  (CORS preflight from http://localhost:3000)
        origin = self.headers.get("Origin", "")
        if not _is_local(origin, is_origin=True):
            self._send(403, {"ok": False, "error": "Only the local dashboard can call this API."})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        self._handle("GET")

    def do_POST(self):  # noqa: N802
        self._handle("POST")

    def _handle(self, method):
        api = self.server.api
        url = urlsplit(self.path)
        try:
            self._check_caller()
            if method == "GET" and url.path == "/api/state":
                self._send(200, api.state())
            elif method == "GET" and url.path == "/api/events":
                self._send(200, {"events": api.events_after(_after(url.query))})
            elif method == "GET" and url.path == "/api/tasks":
                self._send(200, api.tasks())
            elif method == "GET" and url.path == "/api/settings":
                self._send(200, api.settings_info())
            elif method == "GET" and url.path == "/api/logs":
                self._send(200, {"lines": api.logs_after(_after(url.query))})
            elif method == "GET" and url.path == "/api/webcam/photo":
                self._send_bytes(200, api.photo(), "image/jpeg")
            elif method == "POST" and url.path in COMMANDS:
                name, payload = COMMANDS[url.path](self._json_body())
                self._send(*api.submit(name, payload))
            elif url.path in COMMANDS or url.path in GETS:
                raise BadRequest(f"{method} isn't allowed on {url.path}.", status=405)
            else:
                raise BadRequest(f"No such endpoint: {url.path}", status=404)
        except BadRequest as err:
            self._send(err.status, {"ok": False, "error": str(err)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as err:  # noqa: BLE001
            self._send(500, {"ok": False, "error": f"Mom tripped: {err}"})

    def _check_caller(self):
        if not _is_local(self.headers.get("Host", "")):
            raise BadRequest("Only localhost can call this API.", status=403)
        origin = self.headers.get("Origin")
        if origin is not None and not _is_local(origin, is_origin=True):
            raise BadRequest("Only the local dashboard can call this API.", status=403)

    def _json_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise BadRequest("Bad Content-Length.") from None
        if length > MAX_BODY_BYTES:
            raise BadRequest("Body is too big.", status=413)
        raw = self.rfile.read(length) if length else b""
        if not raw.strip():
            return {}
        try:
            body = json.loads(raw)
        except ValueError:
            raise BadRequest("Body must be JSON, like {}.") from None
        if not isinstance(body, dict):
            raise BadRequest("Body must be a JSON object, like {}.")
        return body

    def _send(self, status, body):
        self._send_bytes(status, self.server.api.encode(body), "application/json; charset=utf-8")

    def _send_bytes(self, status, data, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin and _is_local(origin, is_origin=True):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):  # noqa: A002
        pass  # the dashboard polls twice a second; don't flood main.py's log


def _after(query):
    values = parse_qs(query).get("after", ["0"])
    try:
        return int(values[0])
    except ValueError:
        raise BadRequest("after must be an id (a number).") from None
