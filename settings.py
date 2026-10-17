"""Timing knobs for the escalation ladder.

Set DEMO_MODE=1 in .env to shrink everything so the whole ladder fits in a 3-minute demo.
"""

import os

from dotenv import load_dotenv

from common import ENV_FILE

load_dotenv(ENV_FILE)
DEMO_MODE = os.getenv("DEMO_MODE", "0") == "1"


def _pick(demo, real):
    return demo if DEMO_MODE else real


DETECT_EVERY_SECS = _pick(3, 20)               # how often main.py checks the screen
POLL_TEXTS_EVERY_SECS = 2                      # how often main.py checks for new iMessages
TEXT_AFTER_DISTRACTED_SECS = _pick(10, 2 * 60)  # distracted this long → iMessage "?"
CALL_AFTER_DISTRACTED_SECS = _pick(25, 5 * 60)  # distracted this long → phone call
CALLBACK_AFTER_SECS = _pick(45, 5 * 60)        # after a promise on the call → call back
SNITCH_AFTER_MISSED_CALLS = 1                  # this many ignored calls → call the friend
