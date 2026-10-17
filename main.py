"""Mom.exe agent loop: read texts, watch the screen, let the brain decide, act.

Usage:
    python main.py        (set DEMO_MODE=1 in .env for 3-minute-demo timings)

Then text the agent on iMessage, e.g. "Finishing CSE homework by 9 PM".
"""

import os
import queue
import threading
import time
from datetime import datetime

import caller
import detector
import intent
import settings
import texter
from brain import Brain
from common import load_config
from models import Activity, CallResult, Focus, PlaceCall, SendText

LOOP_SLEEP_SECS = 0.5


def log(source, message):
    print(f"{datetime.now():%H:%M:%S} [{source}] {message}", flush=True)


def safely(source, fn, *args):
    """Run one step. Log and swallow errors so one broken module never stops Mom mid-demo."""
    try:
        return fn(*args)
    except Exception as err:  # noqa: BLE001
        log(source, f"error: {err!r}")
        return None


def load_webcam():
    if os.getenv("USE_WEBCAM", "0") != "1":
        return None
    try:
        import webcam
        return webcam
    except Exception as err:  # noqa: BLE001
        log("webcam", f"disabled, couldn't import webcam.py: {err!r}")
        return None


class MomLoop:
    def __init__(self, config):
        self.config = config
        self.brain = Brain(
            user_name=config["USER_NAME"],
            user_phone=config["MY_PHONE_NUMBER"],
            friend_phone=os.getenv("FRIEND_PHONE_NUMBER", "").strip() or None,
        )
        self.webcam = load_webcam()
        self.call_results = queue.Queue()  # filled by call threads, drained by the loop
        self.next_text_poll = 0.0
        self.next_detect = 0.0

    def run_forever(self):
        log("main", f"Mom.exe is up (demo mode: {settings.DEMO_MODE}, webcam: {bool(self.webcam)}). "
                    'Text the agent to start, e.g. "Finishing CSE homework by 9 PM".')
        try:
            while True:
                self.step(time.monotonic())
                time.sleep(LOOP_SLEEP_SECS)
        except KeyboardInterrupt:
            log("main", "bye 👋")

    def step(self, tick):
        if tick >= self.next_text_poll:
            self.next_text_poll = tick + settings.POLL_TEXTS_EVERY_SECS
            self.read_texts()

        if self.brain.goal and tick >= self.next_detect:
            self.next_detect = tick + settings.DETECT_EVERY_SECS
            self.watch_screen()

        while not self.call_results.empty():
            result = self.call_results.get()
            self.execute(safely("brain", self.brain.on_call_ended, result, datetime.now()))

        self.execute(safely("brain", self.brain.on_tick, datetime.now()))

    def read_texts(self):
        for message in safely("text", texter.poll_inbound) or []:
            log("text", f"← {message.text}")
            parsed = safely("intent", intent.parse, message.text, datetime.now())
            if parsed:
                self.execute(safely("brain", self.brain.on_text, parsed, datetime.now()))

    def watch_screen(self):
        activity = safely("detect", detector.get_activity)
        verdict = None
        if activity:
            verdict = safely("detect", detector.classify, activity, self.brain.goal)

        # The webcam only ever adds evidence: phone in hand beats an on-task screen.
        if self.webcam:
            cam = safely("webcam", self.webcam.check)
            if cam and cam.focus == Focus.DISTRACTED:
                activity, verdict = Activity(app="webcam", title="phone in hand"), cam

        if activity and verdict:
            log("detect", f"{verdict.focus.value}: {activity.app} — {activity.title!r} ({verdict.reason})")
            self.execute(safely("brain", self.brain.on_verdict, activity, verdict, datetime.now()))

    def execute(self, actions):
        for action in actions or []:
            if isinstance(action, SendText):
                log("text", f"→ {action.text}")
                safely("text", texter.send_text, action.text)
            elif isinstance(action, PlaceCall):
                self.start_call(action)
            else:
                log("main", f"unknown action: {action!r}")

    def start_call(self, action):
        def run():
            log("call", f"📞 {action.call_type.value} call starting")
            try:
                result = caller.call(
                    self.config, action.to_number, action.call_type, action.variables,
                    on_status=lambda status, _: log("call", f"status: {status}"),
                )
            except Exception as err:  # noqa: BLE001
                log("call", f"failed: {err}")
                result = CallResult(conversation_id="", call_type=action.call_type,
                                    status="failed", answered=False, duration_secs=0)
            log("call", f"ended: answered={result.answered} promise={result.promised_step!r}")
            self.call_results.put(result)

        threading.Thread(target=run, daemon=True).start()


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
