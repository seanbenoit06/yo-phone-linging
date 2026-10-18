"""Timing knobs for the escalation ladder.

Set DEMO_MODE=1 in .env to shrink everything so the whole ladder fits in a 3-minute demo.
The dashboard can flip it at runtime (controls.py → apply_demo_mode). Read these as
settings.X at call time, never `from settings import X`, so a flip takes effect.
"""

import os

from dotenv import load_dotenv

from common import ENV_FILE

load_dotenv(ENV_FILE)

POLL_TEXTS_EVERY_SECS = 2                      # how often main.py checks for new iMessages
SNITCH_AFTER_MISSED_CALLS = 1                  # this many ignored calls → call the friend


def apply_demo_mode(on):
    """Set DEMO_MODE and recompute the timings that depend on it."""
    global DEMO_MODE, DETECT_EVERY_SECS, TEXT_AFTER_DISTRACTED_SECS, CALL_AFTER_DISTRACTED_SECS, CALLBACK_AFTER_SECS
    DEMO_MODE = bool(on)

    def pick(demo, real):
        return demo if DEMO_MODE else real

    DETECT_EVERY_SECS = pick(3, 20)               # how often main.py checks the screen
    TEXT_AFTER_DISTRACTED_SECS = pick(10, 2 * 60)  # distracted this long → iMessage "?"
    CALL_AFTER_DISTRACTED_SECS = pick(25, 5 * 60)  # distracted this long → phone call
    CALLBACK_AFTER_SECS = pick(45, 5 * 60)        # after a promise on the call → call back


apply_demo_mode(os.getenv("DEMO_MODE", "0") == "1")
