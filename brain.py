"""The escalation state machine. Decides when Mom texts, calls, calls back, or snitches.

Pure logic: no network, no sleeping, no reading the clock. main.py feeds it events
with the current time and executes the actions it returns (SendText / PlaceCall).

Ladder: distracted → TEXT_AFTER → iMessage "?" → CALL_AFTER → nudge call
        → answered: follow-up text with the promise, then one callback later
                    (a short grace window first, so the screen left open during the call doesn't count)
        → ignored:  text, keep counting, call again; after SNITCH_AFTER_MISSED_CALLS
                    call the opted-in friend (once per session)
"""

from datetime import timedelta

import settings
from caller import build_dynamic_variables
from models import CallType, Focus, IntentKind, PlaceCall, SendText

MAX_EXCUSES_TO_SEND = 3

# The first nudge: a text before the call. Rotates within a session so Mom doesn't repeat herself.
CHECK_IN_TEXTS = [
    "{name}, what are you doing? {distraction}?? You said {goal}. Mom is watching 👀",
    "Why are you on {distraction}? You said {goal}. I'm watching 👀",
    "{distraction} is not {goal}. Mom can see you 👀",
]
PHONE_CHECK_IN_TEXTS = [
    "Why are you on your phone? Mom can see you 👀 Back to {goal}.",
    "Phone down, {name}. You said {goal}. I'm watching 👀",
]


def _activity_key(activity):
    return activity.url or f"{activity.app}|{activity.title}"


class Brain:
    def __init__(self, user_name, user_phone, friend_phone=None):
        self.user_name = user_name
        self.user_phone = user_phone
        self.friend_phone = friend_phone

        self.goal = None           # None means no session; main.py skips detection then
        self.until = None
        self.excuses = []          # kept across sessions while the process runs
        self.last_activity = None
        self.call_in_progress = False
        self._reset_session_state()

    # ---------- events from main.py ----------

    def on_text(self, intent, now):
        if intent.kind == IntentKind.START_SESSION:
            return self._start_session(intent.goal, intent.until)

        if self.goal is None:
            return [SendText('Tell Mom what you\'re working on, like: "CSE homework until 9 PM"')]

        if intent.kind == IntentKind.NOT_DISTRACTED:
            # The thing Mom flagged, not the current screen: the dashboard button is pressed
            # from the dashboard, which would otherwise be what gets trusted.
            target = self.last_distracting_activity or self.last_activity
            if target:
                self.allowed.add(_activity_key(target))
            self._reset_streak()
            return [SendText("Sorry sorry. Mom believes you. I won't bug you about that again. ❤️")]

        if intent.kind == IntentKind.STOP_SESSION:
            goal = self.goal
            self._end_session()
            return [SendText(f"{goal} done? Good. Mom is proud. A little.")]

        return []

    def on_verdict(self, activity, verdict, now):
        if self.goal is None or self.call_in_progress:
            return []
        self.last_activity = activity

        focus = verdict.focus
        if _activity_key(activity) in self.allowed:
            focus = Focus.ON_TASK
        if focus == Focus.DISTRACTED:
            self.last_distracting_activity = activity

        if focus == Focus.ON_TASK:
            self._reset_streak()
            return []
        if focus == Focus.UNSURE and self.distracted_since is None:
            return []
        if self.distracted_since is None and self.grace_until and now < self.grace_until:
            return []  # just hung up with Mom: time to close TikTok / put the phone down

        # DISTRACTED, or UNSURE in the middle of a distraction streak (e.g. glancing at the
        # dashboard): an unclear screen isn't proof you're back to work, so the clock keeps running.
        if focus == Focus.DISTRACTED:
            if self.distracted_since is None:
                self.distracted_since = now
            self.distraction = verdict.distraction or activity.title
        distracted_for = (now - self.distracted_since).total_seconds()

        actions = []
        if not self.texted and distracted_for >= settings.TEXT_AFTER_DISTRACTED_SECS:
            self.texted = True
            actions.append(SendText(self._check_in_text()))
        if distracted_for >= settings.CALL_AFTER_DISTRACTED_SECS and self._calls_allowed(now):
            # A pending callback (promise made) comes early instead of being replaced by a new nudge.
            call_type = CallType.CALLBACK if self.callback_at else CallType.NUDGE
            self.callback_at = None
            actions.append(self._call(self.user_phone, call_type, now))
        return actions

    def on_call_failed(self, now):
        """The call never went out (API or network error): no texts, no missed call, wait before retrying."""
        self.call_in_progress = False
        self.no_calls_until = now + timedelta(seconds=max(60, settings.CALL_AFTER_DISTRACTED_SECS))
        return []

    def on_call_ended(self, result, now):
        self.call_in_progress = False
        if self.goal is None:
            return []

        self.no_calls_until = now + timedelta(seconds=settings.CALL_AFTER_DISTRACTED_SECS)

        if result.call_type == CallType.SNITCH:
            return [SendText("Mom just called your friend. 😌")] if result.answered else []

        if not result.answered:
            # Keep distracted_since so minutes_distracted keeps growing for the next call.
            self.missed_calls += 1
            actions = [SendText("Mom called. You didn't pick up. 😤")]
            if (self.friend_phone and not self.snitched
                    and self.missed_calls >= settings.SNITCH_AFTER_MISSED_CALLS):
                self.snitched = True
                actions.append(self._call(self.friend_phone, CallType.SNITCH, now))
            return actions

        self.missed_calls = 0
        self._reset_streak()
        self.grace_until = now + timedelta(seconds=settings.POST_CALL_GRACE_SECS)
        if result.excuse:
            self.excuses.append(result.excuse)

        if result.call_type == CallType.NUDGE and result.promised_step:
            self.last_promise = result.promised_step
            self.callback_at = now + timedelta(seconds=settings.CALLBACK_AFTER_SECS)
            minutes = max(1, round(settings.CALLBACK_AFTER_SECS / 60))
            return [SendText(
                f"You promised Mom: {result.promised_step}. "
                f"I'm calling back in {minutes} min. Don't make me call your cousin."
            )]

        if result.call_type == CallType.CALLBACK:
            if result.promised_step:
                self.last_promise = result.promised_step
                return [SendText(f"OK, smaller step: {result.promised_step}. Mom trusts you.")]
            self.last_promise = None
            return [SendText("Good. Mom is proud. Now keep going.")]

        return [SendText(f"Mom heard you. Now go do your {self.goal}.")]

    def on_tick(self, now):
        if self.goal is None:
            return []

        if self.until and now >= self.until:
            goal = self.goal
            self._end_session()
            return [SendText(f"Time's up! Did you finish {goal}? Mom wants a report.")]

        if self.callback_at and now >= self.callback_at and not self.call_in_progress:
            self.callback_at = None
            return [self._call(self.user_phone, CallType.CALLBACK, now)]
        return []

    # ---------- helpers ----------

    def _start_session(self, goal, until):
        self._reset_session_state()
        self.goal = goal
        self.until = until
        when = f" until {until.strftime('%I:%M %p').lstrip('0')}" if until else ""  # %-I crashes on Windows
        return [SendText(f"OK {self.user_name}. {goal}{when}. Mom is watching. 👀")]

    def _end_session(self):
        self.goal = None
        self.until = None
        self._reset_session_state()

    def _reset_session_state(self):
        self.allowed = set()       # activities the user said are actually work
        self.last_distracting_activity = None  # what "I'm actually working" whitelists
        self.grace_until = None    # no new distraction streak before this (right after an answered call)
        self.distraction = None
        self.missed_calls = 0
        self.snitched = False
        self.last_promise = None
        self.callback_at = None
        self.no_calls_until = None
        self.check_ins = 0         # check-in texts sent this session, to rotate CHECK_IN_TEXTS
        self._reset_streak()

    def _reset_streak(self):
        self.distracted_since = None
        self.texted = False

    def _check_in_text(self):
        on_phone = (self.distraction or "").lower() == "your phone"
        templates = PHONE_CHECK_IN_TEXTS if on_phone else CHECK_IN_TEXTS
        text = templates[self.check_ins % len(templates)]
        self.check_ins += 1
        return text.format(name=self.user_name, distraction=self.distraction or "that", goal=self.goal)

    def _calls_allowed(self, now):
        return self.no_calls_until is None or now >= self.no_calls_until

    def _call(self, to_number, call_type, now):
        self.call_in_progress = True
        minutes = 0
        if self.distracted_since:
            minutes = int((now - self.distracted_since).total_seconds() // 60)
        excuses = "; ".join(self.excuses[-MAX_EXCUSES_TO_SEND:]) or None
        variables = build_dynamic_variables(
            self.user_name, self.goal, self.distraction, max(1, minutes),
            call_type=call_type, last_promise=self.last_promise, past_excuses=excuses,
        )
        return PlaceCall(call_type=call_type, to_number=to_number, variables=variables)
