"""Mom calls you right now about today's calendar (the briefing call).

Usage:
    python -m mom.calendar.brief                         # real calendar, real call
    python -m mom.calendar.brief --dry-run               # real calendar, print instead of calling
    python -m mom.calendar.brief --fake-events --dry-run # no Google, no call

Run it on demand for now. Later a morning cron job / scheduled task can run the same command.
"""

import argparse
from datetime import datetime

from mom.calendar.briefing import build_briefing_reason
from mom.caller import CallError, load_call_config, make_call
from mom.config import fail, optional_config


def parse_args():
    parser = argparse.ArgumentParser(description="Mom calls you about today's calendar.")
    parser.add_argument("--fake-events", action="store_true", help="use a made-up day instead of Google Calendar")
    parser.add_argument("--dry-run", action="store_true", help="print the call instead of placing it")
    return parser.parse_args()


def main():
    args = parse_args()
    config = load_call_config()
    # The default agent's prompt needs goal / opening_line / ..., which a briefing doesn't send.
    if not optional_config("ELEVENLABS_AGENT_ID_CALENDAR"):
        message = (
            "No calendar agent: ELEVENLABS_AGENT_ID_CALENDAR isn't set in .env.\n"
            "   Run `python -m mom.calendar.agent` and put the ID it prints in .env."
        )
        if not args.dry_run:
            fail(message)
        print(f"⚠️  {message}")
    now = datetime.now().astimezone()

    if args.fake_events:
        from mom.calendar.fake import fake_events

        events = fake_events(now)
    else:
        from mom.calendar.auth import AuthError
        from mom.calendar.gcal import CalendarError, fetch_todays_events

        try:
            events = fetch_todays_events(now)
        except (AuthError, CalendarError) as err:
            fail(str(err))

    reason = build_briefing_reason(events, now)
    print(f"📅 {reason.summary}")
    print("   " + reason.dynamic_variables["todays_events"].replace("\n", "\n   "))
    try:
        make_call(config, reason, dry_run=args.dry_run)
    except CallError as err:
        fail(str(err))


if __name__ == "__main__":
    main()
