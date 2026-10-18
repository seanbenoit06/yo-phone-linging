"""Shared data types. Modules only talk to each other through these.

See INTERFACES.md for who owns which module.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional


# ---------- detector.py (F2) ----------

@dataclass
class Activity:
    """What is on screen right now."""
    app: str                   # frontmost app, e.g. "Google Chrome"
    title: str                 # window title, or the active tab title for browsers
    url: Optional[str] = None  # active tab URL when the app is a browser


class Focus(str, Enum):
    ON_TASK = "on_task"
    DISTRACTED = "distracted"
    UNSURE = "unsure"


@dataclass
class Verdict:
    focus: Focus
    distraction: Optional[str] = None  # short label Mom says out loud, e.g. "TikTok"; set only when DISTRACTED
    reason: str = ""                   # one line for logs


# ---------- texter.py + intent.py (F1) ----------

@dataclass
class InboundText:
    """One iMessage the user sent to the agent."""
    message_id: str
    text: str
    received_at: datetime


class IntentKind(str, Enum):
    START_SESSION = "start_session"    # "Finishing CSE homework by 9 PM"
    NOT_DISTRACTED = "not_distracted"  # "I'm actually working"
    STOP_SESSION = "stop_session"      # "done", "stop"
    OTHER = "other"


@dataclass
class Intent:
    kind: IntentKind
    text: str                          # the original message
    goal: Optional[str] = None         # START_SESSION only, e.g. "CSE homework"
    until: Optional[datetime] = None   # START_SESSION only, local time


# ---------- tasks/ (Canvas now; Trello / Calendar later) ----------

@dataclass
class Task:
    """Something the user has to do, from an outside source."""
    id: str                          # stable and unique across sources, e.g. "canvas:assignment:123"
    source: str                      # "canvas" | "trello" | "calendar"
    title: str                       # e.g. "Week 3 Conceptual Problems"
    context: str                     # short course / board name, e.g. "MATH 208"
    due_at: Optional[datetime] = None  # timezone-aware; None if there is no deadline
    url: Optional[str] = None        # link to open the task in its source
    points: Optional[float] = None   # Canvas points possible, if any


# ---------- caller.py ----------

class CallType(str, Enum):
    NUDGE = "nudge"        # first call when the user keeps scrolling
    CALLBACK = "callback"  # checking on the promise made in the last call
    SNITCH = "snitch"      # calling the opted-in friend


@dataclass
class CallResult:
    conversation_id: str
    call_type: CallType
    status: str                          # "done" or "failed"
    answered: bool                       # True if the person said anything
    duration_secs: int
    transcript: List[Dict] = field(default_factory=list)  # [{"role": "agent"|"user", "message": str, "time_in_call_secs": int}]
    summary: Optional[str] = None
    promised_step: Optional[str] = None  # ElevenLabs Data Collection field "promised_step"
    excuse: Optional[str] = None         # ElevenLabs Data Collection field "excuse"


# ---------- brain.py output (F4) ----------

@dataclass
class SendText:
    """Text the user on iMessage."""
    text: str


@dataclass
class PlaceCall:
    """Call someone. variables come from caller.build_dynamic_variables()."""
    call_type: CallType
    to_number: str             # E.164
    variables: Dict[str, str]
