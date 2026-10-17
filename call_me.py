"""Mom.exe: make ElevenLabs call your phone right now through the Photon SIP trunk,
wait for the call to end, then print the transcript. Handy for testing the call path
without any trigger.

Usage:
    python call_me.py
    python call_me.py --goal "CSE homework" --distraction "TikTok"
    python call_me.py --dry-run
"""

import argparse

from mom.caller import CallError, load_call_config, make_call
from mom.config import fail
from mom.triggers.base import CallReason

MINUTES_DISTRACTED = "5"


def parse_args():
    parser = argparse.ArgumentParser(description="Make Mom.exe call you.")
    parser.add_argument("--goal", default="CSE homework", help='what you should be doing (default: "CSE homework")')
    parser.add_argument("--distraction", default="TikTok", help='what you are doing instead (default: "TikTok")')
    parser.add_argument("--dry-run", action="store_true", help="print the call instead of placing it")
    return parser.parse_args()


def main():
    args = parse_args()
    config = load_call_config()
    # Uses the default agent (ELEVENLABS_AGENT_ID), whose prompt expects these variables.
    # Its first message is just {{opening_line}}; "none" means unknown to the prompt.
    opening_line = (
        f"{config['USER_NAME']}! {MINUTES_DISTRACTED} min on {args.distraction}?! "
        f"Cousin Kevin would never. What are you stuck on with {args.goal}?"
    )
    reason = CallReason(
        trigger="manual",
        dedup_key="manual",
        dynamic_variables={
            "goal": args.goal,
            "distraction": args.distraction,
            "minutes_distracted": MINUTES_DISTRACTED,
            "call_type": "nudge",
            "last_promise": "none",
            "past_excuses": "none",
            "opening_line": opening_line,
        },
        summary="manual test call",
    )
    try:
        make_call(config, reason, dry_run=args.dry_run)
    except CallError as err:
        fail(str(err))


if __name__ == "__main__":
    main()
