"""The contract between features (triggers) and the shared core.

A trigger answers one question each poll: "should Mom call right now, and why?"
It never places calls itself; mom/run.py does that, so cooldowns and dedup
apply to every feature the same way.

Changing this file affects every feature. Agree on changes with the other owner first.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol


@dataclass
class CallReason:
    # Must match the trigger's name ("screen", "calendar", ...). Also selects the
    # ElevenLabs agent: ELEVENLABS_AGENT_ID_<TRIGGER> if set, else ELEVENLABS_AGENT_ID.
    trigger: str
    # Same key = same situation. Mom calls at most once per key, ever
    # (e.g. "calendar:<event_id>:<start_iso>" or "screen:tiktok:<session_start_iso>").
    dedup_key: str
    # Passed to the ElevenLabs agent prompt as {{name}} variables. user_name is added automatically.
    # Values must be strings.
    dynamic_variables: dict
    # One line for logs, e.g. "Standup starts in 10 min".
    summary: str = ""


class Trigger(Protocol):
    name: str

    def check(self, now: datetime) -> Optional[CallReason]:
        """Return a CallReason if Mom should call now, else None.

        Called every poll interval (default 60s) with a timezone-aware local time.
        Keep it fast and don't block; raise on errors (run.py logs them and keeps going).
        """
        ...
