"""Mom.exe agent loop: read texts, watch the screen, let the brain decide, act.

Usage:
    python main.py        (set DEMO_MODE=1 in .env for 3-minute-demo timings)

Then text the agent on iMessage, e.g. "Finishing CSE homework by 9 PM", or open the
dashboard (web/, API on http://127.0.0.1:8765 or API_PORT).
"""

import os
import queue
import threading
import time
from dataclasses import dataclass
from datetime import datetime

import caller
import detector
import intent
import settings
import texter
from api import DEFAULT_PORT, HOST, DashboardApi, iso
from brain import MAX_EXCUSES_TO_SEND, Brain, _activity_key
from common import fail, load_config
from models import Activity, CallResult, CallType, Focus, IntentKind, PlaceCall, SendText, Verdict

LOOP_SLEEP_SECS = 0.5
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


def log(source, message):
    print(f"{datetime.now():%H:%M:%S} [{source}] {message}", flush=True)


def load_webcam():
    if os.getenv("USE_WEBCAM", "0") != "1":
        return None
    try:
        import webcam
        return webcam
    except Exception as err:  # noqa: BLE001
        log("webcam", f"disabled, couldn't import webcam.py: {err!r}")
        return None


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
        self.config = config
        friend_phone = os.getenv("FRIEND_PHONE_NUMBER", "").strip() or None
        self.brain = Brain(
            user_name=config["USER_NAME"],
            user_phone=config["MY_PHONE_NUMBER"],
            friend_phone=friend_phone,
        )
        self.webcam = load_webcam()
        self.call_results = queue.Queue()  # (call id, CallResult, error) from call threads, drained by the loop
        self.next_text_poll = 0.0
        self.next_detect = 0.0

        # Everything below only feeds the dashboard; the brain never reads it.
        self.api = DashboardApi(redact=secrets_to_redact(config["MY_PHONE_NUMBER"], friend_phone))
        self.calls = {}                    # call id → Call, while the call thread runs
        self.next_call_id = 1
        self.session_started_at = None
        self.last_detect_tick = None
        self.activity = None               # last thing on screen, for the "Right now" card
        self.verdict = None
        self.last_focus = None             # a verdict event is recorded only when this changes
        self.forced_until = None           # monotonic time; POST /api/demo/force-distracted
        self.forced = None                 # (Activity, Verdict) used instead of the detector
        # "source.function" → error message, until that same function succeeds again.
        # Drives the health dots, and records each new error on the timeline only once.
        self.failing = {}
        if not self.webcam and os.getenv("USE_WEBCAM", "0") == "1":
            self.failing["webcam.import"] = "USE_WEBCAM=1 but webcam.py couldn't be imported (see the terminal)."
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
        log("main", f"Mom.exe is up (demo mode: {settings.DEMO_MODE}, webcam: {bool(self.webcam)}). "
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
        else:
            self.forced = self.forced_until = None
            activity, verdict = self.detect()

        if activity and verdict:
            log("detect", f"{verdict.focus.value}: {activity.app} — {activity.title!r} ({verdict.reason})")
            self.note_verdict(activity, verdict, tick)
            if not self.test_call_running():
                self.execute(self.safely("brain", self.brain.on_verdict, activity, verdict, datetime.now()))

    def detect(self):
        activity = self.safely("detect", detector.get_activity, none_is_error=NO_SCREEN_ERROR)
        verdict = None
        if activity:
            verdict = self.safely("detect", detector.classify, activity, self.brain.goal)

        # The webcam only ever adds evidence: phone in hand beats an on-task screen.
        if self.webcam:
            cam = self.safely("webcam", self.webcam.check)
            if cam and cam.focus == Focus.DISTRACTED:
                activity, verdict = Activity(app="webcam", title="phone in hand"), cam
        return activity, verdict

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
        if module == "webcam" and not self.webcam and "webcam.import" not in self.failing:
            return {"status": "off"}
        errors = [message for key, message in self.failing.items()
                  if MODULE_OF_SOURCE.get(key.split(".")[0]) == module]
        return {"status": "error", "message": errors[-1]} if errors else {"status": "ok"}

    def record(self, kind, summary, /, **data):  # positional-only: call_ended data has its own "summary"
        self.api.record(kind, summary, data)

    def session_started(self):
        self.session_started_at = datetime.now()
        self.last_detect_tick = time.monotonic()
        self.activity = self.verdict = self.last_focus = None
        self.forced = self.forced_until = None
        self.next_detect = 0.0
        until = iso(self.brain.until)
        when = f" until {self.brain.until:%-I:%M %p}" if self.brain.until else ""
        self.record("session_started", f"Session started: {self.brain.goal}{when}", goal=self.brain.goal, until=until)

    def session_ended(self, goal, reason):
        self.session_started_at = None
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
        })


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
