"""Mom.exe agent loop: read texts, watch the screen, let the brain decide, act.

Usage:
    python main.py        (set DEMO_MODE=1 in .env for 3-minute-demo timings)

Then text the agent on iMessage, e.g. "Finishing CSE homework by 9 PM", or open the
dashboard (web/, API on http://127.0.0.1:8765 or API_PORT).
"""

import os
import queue
import shutil
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta

import caller
import controls
import detector
import intent
import settings
import texter
from api import DEFAULT_PORT, HOST, DashboardApi, iso
from brain import MAX_EXCUSES_TO_SEND, Brain, _activity_key
from common import fail, load_config
from models import Activity, CallResult, CallType, Focus, IntentKind, PlaceCall, SendText, Verdict

LOOP_SLEEP_SECS = 0.5
PREVIEW_EVERY_SECS = 3      # camera preview photos (no Gemini) while the dashboard's camera window is open
# Which dashboard health dot a failing step turns red.
MODULE_OF_SOURCE = {"text": "imessage", "detect": "detector", "call": "calls", "webcam": "webcam"}
# The test call needs something to talk about when no session is running (same as call_me.py).
TEST_CALL_GOAL = "CSE homework"
TEST_CALL_DISTRACTION = "TikTok"
TEST_CALL_MINUTES = 5
CALL_STARTED_SUMMARY = {
    CallType.NUDGE: "Mom is calling you",
    CallType.CALLBACK: "Mom is calling you back",
    CallType.SNITCH: "Mom is calling your friend",
}
FOCUS_SUMMARY = {Focus.ON_TASK: "On task", Focus.DISTRACTED: "Distracted", Focus.UNSURE: "Not sure"}
NO_SCREEN_ERROR = ("Can't read the active window. Check macOS Privacy & Security "
                   "(Accessibility / Automation) for your terminal.")


_dashboard = None  # the DashboardApi, so log lines also reach GET /api/logs


def log(source, message):
    print(f"{datetime.now():%H:%M:%S} [{source}] {message}", flush=True)
    if _dashboard:
        _dashboard.log_line(source, message)


def cam_stale_secs():
    """Ignore a webcam result older than this (a few missed checks), e.g. after the thread hiccups."""
    return settings.DETECT_EVERY_SECS * 3 + 5


def load_webcam():
    """(webcam module, None) if this computer can use the camera, else (None, why not).

    Loaded whether or not the camera is switched on, so the dashboard can turn it on later.
    """
    if sys.platform != "darwin":
        return None, "The camera only works on macOS for now."
    if not shutil.which("ffmpeg"):
        return None, "ffmpeg isn't installed (brew install ffmpeg), so Mom can't use the camera."
    try:
        import webcam
        return webcam, None
    except Exception as err:  # noqa: BLE001
        log("webcam", f"couldn't import webcam.py: {err!r}")
        return None, f"webcam.py couldn't be loaded ({type(err).__name__}). See the terminal."


def verdict_method(reason):
    """How the detector decided, from its reason prefix: rule / ai / screenshot, or None."""
    head = (reason or "").split(":", 1)[0].strip().lower()
    if head == "rule":
        return "rule"
    if head.endswith("+screenshot"):
        return "screenshot"
    if head.startswith(("gemini", "jev")):
        return "ai"
    return None


def verdict_json(verdict):
    return verdict and {"focus": verdict.focus.value, "distraction": verdict.distraction, "reason": verdict.reason}


def warm_tasks_cache():
    """Fetch task sources once at startup, so the dashboard's first GET /api/tasks hits the cache."""
    try:
        from tasks import get_tasks
        get_tasks()
    except Exception as err:  # noqa: BLE001
        log("tasks", f"warm-up failed: {type(err).__name__}")  # only the type: a message could echo a token


def send_text(text):
    """texter.send_text returns None, so return True to tell success apart from a swallowed error."""
    texter.send_text(text)
    return True


@dataclass
class Call:
    id: int
    call_type: CallType
    started_at: datetime
    test: bool


class MomLoop:
    def __init__(self, config):
        global _dashboard
        self.config = config
        friend_phone = os.getenv("FRIEND_PHONE_NUMBER", "").strip() or None
        self.brain = Brain(
            user_name=config["USER_NAME"],
            user_phone=config["MY_PHONE_NUMBER"],
            friend_phone=friend_phone,
        )
        # Everything dashboard-related only feeds the dashboard; the brain never reads it.
        self.api = DashboardApi(redact=secrets_to_redact(config["MY_PHONE_NUMBER"], friend_phone))
        _dashboard = self.api
        self.webcam, webcam_reason = load_webcam()
        controls.load(webcam_available=bool(self.webcam), webcam_reason=webcam_reason)
        self.api.settings_info = controls.info
        self.api.photo_source = self.current_photo

        self.call_results = queue.Queue()  # (call id, CallResult, error) from call threads, drained by the loop
        self.next_text_poll = 0.0
        self.next_detect = 0.0

        self.calls = {}                    # call id → Call, while the call thread runs
        self.next_call_id = 1
        self.session_started_at = None
        self.last_detect_tick = None
        self.activity = None               # last thing on screen, for the "Right now" card
        self.verdict = None
        self.last_focus = None             # a verdict event is recorded only when this changes
        self.forced_until = None           # monotonic time; POST /api/demo/force-distracted
        self.forced = None                 # (Activity, Verdict) used instead of the detector
        # The webcam check takes ~3 s, so it runs in its own thread (watch_webcam) and the loop
        # only reads its latest result; otherwise texts and dashboard commands would stall.
        self.cam_lock = threading.Lock()
        # Latest judged photo: (monotonic time, Verdict or None, Exception or None, judged_at, latency_ms).
        self.cam_result = None
        self.cam_epoch = 0                 # bumped when a session starts/ends; a check from before is dropped
        self.cam_preview_error = None      # why the last preview photo failed (webcam thread)
        # monitor.screen for the dashboard: when and how the screen was last checked.
        self.screen_check = {"at": None, "method": None, "latency_ms": None}
        # "source.function" → error message, until that same function succeeds again.
        # Drives the health dots, and records each new error on the timeline only once.
        self.failing = {}
        self.stats = {"focused_secs": 0.0, "distracted_secs": 0.0, "calls_made": 0, "texts_sent": 0}
        self.publish()

    def run_forever(self):
        port = os.getenv("API_PORT", "").strip() or str(DEFAULT_PORT)
        if not port.isdigit():
            fail(f"API_PORT must be a port number, like {DEFAULT_PORT} (got {port!r}). Fix it in .env.")
        try:
            self.api.serve(int(port))
        except OSError as err:
            fail(f"Can't start the dashboard API on {HOST}:{port}: {err.strerror or err}.\n"
                 "   Another `python main.py` is probably still running. Stop it (Ctrl+C),\n"
                 "   or set API_PORT to a free port in .env.")
        threading.Thread(target=warm_tasks_cache, name="tasks-warm-up", daemon=True).start()
        if self.webcam:
            threading.Thread(target=self.watch_webcam, name="webcam", daemon=True).start()
        on = controls.get()
        log("main", f"Mom.exe is up (demo mode: {settings.DEMO_MODE}, screen: {controls.screen_enabled()}, "
                    f"screenshots: {on['screenshots']}, webcam: {controls.webcam_enabled()}). "
                    'Text the agent to start, e.g. "Finishing CSE homework by 9 PM".')
        log("api", f"dashboard API on http://{HOST}:{port}/api/state")
        try:
            while True:
                self.step(time.monotonic())
                time.sleep(LOOP_SLEEP_SECS)
        except KeyboardInterrupt:
            log("main", "bye 👋")

    def step(self, tick):
        self.run_commands()

        if tick >= self.next_text_poll:
            self.next_text_poll = tick + settings.POLL_TEXTS_EVERY_SECS
            self.read_texts()

        if self.brain.goal and tick >= self.next_detect:
            self.next_detect = tick + settings.DETECT_EVERY_SECS
            self.watch_screen(tick)
        self.sync_preview_health()

        while not self.call_results.empty():
            call_id, result, error = self.call_results.get()
            call = self.calls.pop(call_id)
            self.record_call_ended(call, result, error)
            if not call.test:  # a test call must never trigger a callback or a snitch call
                self.execute(self.safely("brain", self.brain.on_call_ended, result, datetime.now()))

        if not self.test_call_running():
            goal = self.brain.goal
            self.execute(self.safely("brain", self.brain.on_tick, datetime.now()))
            if goal and self.brain.goal is None:
                self.session_ended(goal, "time_up")

        self.publish()

    def read_texts(self):
        for message in self.safely("text", texter.poll_inbound) or []:
            log("text", f"← {message.text}")
            self.record("text_in", f"You: {message.text}", text=message.text)
            parsed = self.safely("intent", intent.parse, message.text, datetime.now())
            if parsed:
                self.execute(self.on_intent(parsed))

    def on_intent(self, parsed):
        """iMessages and dashboard commands both end up here."""
        goal = self.brain.goal
        actions = self.safely("brain", self.brain.on_text, parsed, datetime.now())
        if parsed.kind == IntentKind.START_SESSION and self.brain.goal:
            self.session_started()
        elif goal and self.brain.goal is None:
            self.session_ended(goal, "stopped")
        return actions

    def watch_screen(self, tick):
        if self.forced and time.monotonic() < self.forced_until:
            activity, verdict = self.forced
            self.screen_check = {"at": datetime.now(), "method": "forced", "latency_ms": 0}
        else:
            self.forced = self.forced_until = None
            activity, verdict = self.detect()

        if activity and verdict:
            log("detect", f"{verdict.focus.value}: {activity.app} — {activity.title!r} ({verdict.reason})")
            self.note_verdict(activity, verdict, tick)
            if not self.test_call_running():
                self.execute(self.safely("brain", self.brain.on_verdict, activity, verdict, datetime.now()))

    def detect(self):
        """The screen (if screen monitoring is on) plus the webcam (if it's on). Either can be off."""
        activity = verdict = None
        screen_on = controls.screen_enabled()
        if screen_on:
            started = time.monotonic()
            activity = self.safely("detect", detector.get_activity, none_is_error=NO_SCREEN_ERROR)
            if activity:
                verdict = self.safely("detect", detector.classify, activity, self.brain.goal)
            self.screen_check = {"at": datetime.now(), "method": verdict_method(verdict and verdict.reason),
                                 "latency_ms": round((time.monotonic() - started) * 1000)}

        if self.webcam and controls.webcam_enabled():
            cam = self.safely("webcam", self.latest_webcam_verdict)
            # With the screen on, the webcam only adds evidence: phone in hand beats an on-task screen,
            # but a distracting screen keeps its own label (TikTok stays TikTok on the call).
            # With the screen off, the webcam is all Mom has, so its "focused" counts too.
            screen_distracted = (verdict is not None and verdict.focus == Focus.DISTRACTED
                                 and _activity_key(activity) not in self.brain.allowed)
            if cam and ((cam.focus == Focus.DISTRACTED and not screen_distracted) or not screen_on):
                activity, verdict = Activity(app="webcam", title="phone in hand" if cam.distraction else "camera"), cam
        return activity, verdict

    def watch_webcam(self):
        """Background thread. Camera on + session: judge a photo every check. Camera on, no session,
        dashboard's camera window open: preview photos only (no Gemini). Camera off: drop the photo."""
        while True:
            if not controls.webcam_enabled():
                if self.webcam.latest_photo():
                    self.webcam.forget_photo()
                with self.cam_lock:
                    self.cam_result = None
                self.cam_preview_error = None
                time.sleep(1)
            elif self.brain.goal:
                with self.cam_lock:
                    epoch = self.cam_epoch
                started = time.monotonic()
                try:
                    cam, error = self.webcam.check(), None
                except Exception as err:  # noqa: BLE001  (check() shouldn't raise, but never kill this thread)
                    cam, error = None, err
                latency_ms = round((time.monotonic() - started) * 1000)
                with self.cam_lock:
                    if self.cam_epoch == epoch:  # the session didn't stop or restart during the ~3 s check
                        self.cam_result = (time.monotonic(), cam, error, datetime.now(), latency_ms)
                self.cam_preview_error = None
                time.sleep(settings.DETECT_EVERY_SECS)
            elif self.api.preview_wanted():
                photo = self.webcam.snapshot()
                self.cam_preview_error = None if photo else (self.webcam.last_error() or "Couldn't take a photo.")
                time.sleep(PREVIEW_EVERY_SECS)
            else:
                time.sleep(0.5)

    def latest_webcam_verdict(self):
        """The webcam thread's latest Verdict, or None if it's too old. Raises its error, for safely()."""
        with self.cam_lock:
            result = self.cam_result
        if result is None or time.monotonic() - result[0] > cam_stale_secs():
            return None
        if result[2] is not None:
            raise result[2]
        return result[1]

    def sync_preview_health(self):
        """Turn the webcam health dot red when preview photos fail (the thread can't call safely())."""
        error, key = self.cam_preview_error, "webcam.snapshot"
        if error and self.failing.get(key) != error:
            log("webcam", f"preview error: {error}")
            self.note_failure("webcam", key, error)
        elif not error:
            self.failing.pop(key, None)

    def current_photo(self):
        """For GET /api/webcam/photo: (jpeg bytes, None) or (None, why there's no photo)."""
        if not self.webcam:
            return None, controls.info()["unavailable_reason"].get("webcam", "The camera isn't available.")
        if not controls.webcam_enabled():
            return None, "The camera is off. Turn it on in the Control Panel."
        photo = self.webcam.latest_photo()
        if not photo:
            return None, self.cam_preview_error or "No photo yet. Mom is taking one."
        return photo[0], None

    def execute(self, actions, test=False):
        for action in actions or []:
            if isinstance(action, SendText):
                log("text", f"→ {action.text}")
                if self.safely("text", send_text, action.text):
                    self.stats["texts_sent"] += 1
                    self.record("text_out", f"Mom: {action.text}", text=action.text)
            elif isinstance(action, PlaceCall):
                self.start_call(action, test)
            else:
                log("main", f"unknown action: {action!r}")

    def start_call(self, action, test=False):
        call = Call(self.next_call_id, action.call_type, datetime.now(), test)
        self.next_call_id += 1
        self.calls[call.id] = call
        self.stats["calls_made"] += 1
        summary = CALL_STARTED_SUMMARY[action.call_type] + (" (test call)" if test else "")
        self.record("call_started", summary, call_type=action.call_type.value,
                    opening_line=action.variables.get("opening_line", ""))

        def run():
            log("call", f"📞 {action.call_type.value} call starting" + (" (test)" if test else ""))
            error = None
            try:
                result = caller.call(
                    self.config, action.to_number, action.call_type, action.variables,
                    on_status=lambda status, _: log("call", f"status: {status}"),
                )
            except Exception as err:  # noqa: BLE001
                log("call", f"failed: {err}")
                error = str(err) or repr(err)
                result = CallResult(conversation_id="", call_type=action.call_type,
                                    status="failed", answered=False, duration_secs=0)
            log("call", f"ended: answered={result.answered} promise={result.promised_step!r}")
            self.call_results.put((call.id, result, error))

        threading.Thread(target=run, daemon=True).start()

    def test_call_running(self):
        return any(call.test for call in self.calls.values())

    # ---------- dashboard commands (api.py) ----------

    def run_commands(self):
        for command in self.api.take_commands():
            log("api", f"← {command.name}")
            try:
                status, body, actions = self.handle_command(command.name, command.payload)
            except Exception as err:  # noqa: BLE001
                log("api", f"error: {err!r}")
                self.record("error", f"api: {err}", source="api", message=str(err))
                status, body, actions = 500, {"ok": False, "error": f"Mom tripped: {err}"}, []
            # Reply before sending texts, so the button doesn't wait on iMessage.
            self.publish()
            command.reply(status, body)
            self.execute(actions, test=command.name == "test_call")

    def handle_command(self, name, payload):
        """Return (HTTP status, JSON body, actions to execute)."""
        if name == "intent":
            if payload.kind != IntentKind.START_SESSION and self.brain.goal is None:
                return 400, {"ok": False, "error": "No session running. Tell Mom what you're working on first."}, []
            actions = self.on_intent(payload)
            if payload.kind != IntentKind.START_SESSION:
                return 200, {"ok": True}, actions
            if not self.brain.goal:
                return 500, {"ok": False, "error": "Mom couldn't start the session. Check the terminal."}, []
            return 200, {"ok": True, "goal": self.brain.goal, "until": iso(self.brain.until)}, actions

        if name == "test_call":
            if self.brain.call_in_progress or self.calls:
                return 409, {"ok": False, "error": "Mom is already on the phone."}, []
            return 200, {"ok": True, "call_type": CallType.NUDGE.value}, [self.test_call()]

        if name == "force_distracted":
            if self.brain.goal is None:
                return 400, {"ok": False, "error": "No session running. Start one before forcing a distraction."}, []
            distraction, seconds = payload["distraction"], payload["seconds"]
            # A unique title each time, so an earlier "I'm actually working" can't whitelist it.
            activity = Activity(app=distraction, title=f"Forced from the dashboard at {datetime.now():%H:%M:%S}")
            verdict = Verdict(Focus.DISTRACTED, distraction, reason=f"demo override for {seconds}s")
            self.forced, self.forced_until = (activity, verdict), time.monotonic() + seconds
            self.next_detect = 0.0
            log("api", f"forcing distracted on {distraction!r} for {seconds}s")
            return 200, {"ok": True, "distraction": distraction, "seconds": seconds}, []

        if name == "settings":
            before = controls.get()
            try:
                info = controls.update(payload)
            except controls.SettingsError as err:
                return 400, {"ok": False, "error": str(err)}, []
            changed = {key: value for key, value in info["settings"].items() if before.get(key) != value}
            if changed:
                log("api", "settings: " + ", ".join(f"{key}={value}" for key, value in changed.items()))
            if "demo_mode" in changed:
                self.next_detect = 0.0  # use the new check interval right away
            if changed.get("screen_monitoring") is False:
                self.activity = self.verdict = None
                self.screen_check = {"at": None, "method": None, "latency_ms": None}
                self.failing = {key: message for key, message in self.failing.items() if not key.startswith("detect.")}
            if changed.get("webcam") is False:
                self.failing = {key: message for key, message in self.failing.items() if not key.startswith("webcam.")}
            return 200, {"ok": True, **info}, []

        return 400, {"ok": False, "error": f"Unknown command: {name}"}, []

    def test_call(self):
        brain = self.brain
        minutes = TEST_CALL_MINUTES
        if brain.distracted_since:
            minutes = max(1, int((datetime.now() - brain.distracted_since).total_seconds() // 60))
        variables = caller.build_dynamic_variables(
            brain.user_name, brain.goal or TEST_CALL_GOAL, brain.distraction or TEST_CALL_DISTRACTION, minutes,
            call_type=CallType.NUDGE, last_promise=brain.last_promise,
            past_excuses="; ".join(brain.excuses[-MAX_EXCUSES_TO_SEND:]) or None,
        )
        return PlaceCall(call_type=CallType.NUDGE, to_number=brain.user_phone, variables=variables)

    # ---------- dashboard state ----------

    def safely(self, source, fn, *args, none_is_error=None):
        """Run one step. Log and swallow errors so one broken module never stops Mom mid-demo.

        none_is_error: message to report when fn returns None (it already warned in the terminal).
        """
        key = f"{source}.{getattr(fn, '__name__', '?')}"
        try:
            result = fn(*args)
        except Exception as err:  # noqa: BLE001
            log(source, f"error: {err!r}")
            self.note_failure(source, key, str(err) or repr(err))
            return None
        if result is None and none_is_error:
            self.note_failure(source, key, none_is_error)
        else:
            self.failing.pop(key, None)
        return result

    def note_failure(self, source, key, message):
        if self.failing.get(key) != message:
            name = MODULE_OF_SOURCE.get(source, source)
            self.record("error", f"{name}: {message}", source=name, message=message)
        self.failing[key] = message

    def module_health(self, module):
        if module == "webcam" and not controls.webcam_enabled():
            reason = controls.info()["unavailable_reason"].get("webcam")
            return {"status": "off", "message": reason} if reason else {"status": "off"}
        if module == "detector" and not controls.screen_enabled():
            reason = controls.info()["unavailable_reason"].get("screen") or "Screen monitoring is off."
            return {"status": "off", "message": reason}
        errors = [message for key, message in self.failing.items()
                  if MODULE_OF_SOURCE.get(key.split(".")[0]) == module]
        return {"status": "error", "message": errors[-1]} if errors else {"status": "ok"}

    def record(self, kind, summary, /, **data):  # positional-only: call_ended data has its own "summary"
        self.api.record(kind, summary, data)

    def session_started(self):
        self.session_started_at = datetime.now()
        with self.cam_lock:
            self.cam_result = None  # a phone seen before this session started doesn't count
            self.cam_epoch += 1
        self.last_detect_tick = time.monotonic()
        self.activity = self.verdict = self.last_focus = None
        self.forced = self.forced_until = None
        self.next_detect = 0.0
        until = iso(self.brain.until)
        when = f" until {self.brain.until:%-I:%M %p}" if self.brain.until else ""
        self.record("session_started", f"Session started: {self.brain.goal}{when}", goal=self.brain.goal, until=until)

    def session_ended(self, goal, reason):
        self.session_started_at = None
        with self.cam_lock:
            self.cam_result = None  # Mom only judges photos during a session
            self.cam_epoch += 1
        self.activity = self.verdict = self.last_focus = None
        self.forced = self.forced_until = None
        summary = f"Session ended: {goal}" + (" (time's up)" if reason == "time_up" else "")
        self.record("session_ended", summary, goal=goal, reason=reason)

    def note_verdict(self, activity, verdict, tick):
        """Update the "Right now" card and the stats; record a verdict event when focus changes."""
        focus, distraction, reason = verdict.focus, verdict.distraction, verdict.reason
        if _activity_key(activity) in self.brain.allowed:  # same override the brain applies
            focus, distraction, reason = Focus.ON_TASK, None, "You told Mom this is work."
        if focus != Focus.DISTRACTED:
            distraction = None

        elapsed = tick - (self.last_detect_tick or tick)
        self.last_detect_tick = tick
        elapsed = min(elapsed, 3 * settings.DETECT_EVERY_SECS)  # don't count a sleeping laptop
        if focus == Focus.ON_TASK:
            self.stats["focused_secs"] += elapsed
        elif focus == Focus.DISTRACTED:
            self.stats["distracted_secs"] += elapsed

        self.activity = {"app": activity.app, "title": activity.title, "url": activity.url}
        self.verdict = {"focus": focus.value, "distraction": distraction, "reason": reason}
        if focus != self.last_focus:
            self.last_focus = focus
            label = (distraction or activity.title) if focus == Focus.DISTRACTED else activity.app
            self.record("verdict", f"{FOCUS_SUMMARY[focus]}: {label}", focus=focus.value, app=activity.app,
                        title=activity.title, distraction=distraction, reason=reason)

    def record_call_ended(self, call, result, error):
        if error:
            self.note_failure("call", "call.call", error)
        elif result.status == "failed":
            self.note_failure("call", "call.call", "ElevenLabs marked the call as failed. Check ElevenLabs → Conversations.")
        else:
            self.failing.pop("call.call", None)

        who = "your friend" if call.call_type == CallType.SNITCH else "you"
        test = " (test call)" if call.test else ""
        if error:
            summary = f"Call failed{test}: {error}"
        elif not result.answered:
            summary = f"Mom called {who}. No answer.{test}"
        else:
            minutes, seconds = divmod(result.duration_secs, 60)
            summary = f"Call with {who} ended after {minutes}:{seconds:02d}{test}"
            if result.promised_step:
                summary += f" · promised: {result.promised_step}"
        transcript = [
            {"role": turn.get("role"), "message": turn.get("message", ""),
             "time_in_call_secs": int(turn.get("time_in_call_secs") or 0)}
            for turn in result.transcript
        ]
        self.record("call_ended", summary, call_type=call.call_type.value, conversation_id=result.conversation_id,
                    answered=result.answered, duration_secs=result.duration_secs,
                    promised_step=result.promised_step, excuse=result.excuse,
                    summary=result.summary or "", transcript=transcript)

    def stage(self):
        brain = self.brain
        if brain.goal is None:
            return "idle"
        if brain.call_in_progress or self.calls:
            return "calling"
        if brain.distracted_since and brain.texted:
            return "texted"
        if brain.distracted_since:
            return "distracted"
        if brain.callback_at:
            return "waiting_callback"
        return "watching"

    def publish(self):
        """Hand api.py a fresh snapshot for GET /api/state. Called from the loop thread only."""
        brain = self.brain
        call = max(self.calls.values(), key=lambda c: c.id, default=None)
        session = None
        if brain.goal is not None:
            session = {"goal": brain.goal, "until": iso(brain.until),
                       "started_at": iso(self.session_started_at or datetime.now())}
        self.api.publish({
            "user_name": brain.user_name,
            "demo_mode": settings.DEMO_MODE,
            "session": session,
            "stage": self.stage(),
            "activity": self.activity if session else None,
            "verdict": self.verdict if session else None,
            "distracted_since": iso(brain.distracted_since),
            "ladder": {
                "text_after_secs": settings.TEXT_AFTER_DISTRACTED_SECS,
                "call_after_secs": settings.CALL_AFTER_DISTRACTED_SECS,
                "callback_after_secs": settings.CALLBACK_AFTER_SECS,
            },
            "call_in_progress": call and {"call_type": call.call_type.value, "started_at": iso(call.started_at)},
            "callback_at": iso(brain.callback_at),
            "last_promise": brain.last_promise,
            "missed_calls": brain.missed_calls,
            "excuses": list(brain.excuses),
            "modules": {module: self.module_health(module) for module in ("imessage", "detector", "calls", "webcam")},
            "stats": {
                "focused_secs": round(self.stats["focused_secs"]),
                "distracted_secs": round(self.stats["distracted_secs"]),
                "calls_made": self.stats["calls_made"],
                "texts_sent": self.stats["texts_sent"],
            },
            "settings": controls.get(),
            "monitor": self.monitor(),
        })

    def monitor(self):
        """State.monitor (docs/UI_SPEC.md section 9): is Mom actually looking, and when did she last look."""
        in_session = self.brain.goal is not None
        screen_on, webcam_on = controls.screen_enabled(), controls.webcam_enabled()
        forced = bool(self.forced and self.forced_until and time.monotonic() < self.forced_until)
        next_check = None
        if in_session and (screen_on or webcam_on or forced):
            next_check = datetime.now() + timedelta(seconds=max(0.0, self.next_detect - time.monotonic()))

        with self.cam_lock:
            cam = self.cam_result
        photo = self.webcam.latest_photo() if self.webcam and webcam_on else None
        return {
            "screen": {
                "enabled": screen_on,
                "active": screen_on and in_session,
                "every_secs": settings.DETECT_EVERY_SECS,
                "last_check_at": iso(self.screen_check["at"]),
                "next_check_at": iso(next_check),
                "method": self.screen_check["method"],
                "latency_ms": self.screen_check["latency_ms"],
            },
            "webcam": {
                "enabled": webcam_on,
                "active": webcam_on and in_session,
                "last_check_at": iso(cam[3]) if cam else None,
                "verdict": verdict_json(cam[1]) if cam else None,
                "latency_ms": cam[4] if cam else None,
                "photo_at": iso(photo[1]) if photo else None,
            },
        }


def secrets_to_redact(*phones):
    """Phone numbers (E.164 and bare digits) and API keys, masked in every API response."""
    values = [value for key, value in os.environ.items() if key.endswith("_API_KEY")]
    for phone in filter(None, phones):
        digits = "".join(ch for ch in phone if ch.isdigit())
        values += [phone, digits, digits[-10:]]
    return values


def main():
    config = load_config([
        "ELEVENLABS_API_KEY",
        "ELEVENLABS_AGENT_ID",
        "ELEVENLABS_PHONE_NUMBER_ID",
        "MY_PHONE_NUMBER",
        "USER_NAME",
    ])
    MomLoop(config).run_forever()


if __name__ == "__main__":
    main()
