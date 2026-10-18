"""Mom calls you about a day on your calendar (the briefing call).

Usage:
    python -m mom.calendar.brief                            # today, right now: real calendar, real call
    python -m mom.calendar.brief --dry-run                  # print instead of calling
    python -m mom.calendar.brief --date 2026-10-16          # brief that day as if it's that morning
    python -m mom.calendar.brief --date 2026-10-16 --at 13:30
    python -m mom.calendar.brief --fake-events --dry-run    # no Google, no call

Run it on demand for now. Later a morning cron job / scheduled task runs it with no
--date (today) at the time you want the call.
"""

import argparse

from datetime import datetime

from mom.calendar.briefing import DEFAULT_BRIEFING_TIME, before_first_event, briefing_time, build_briefing_reason
from mom.caller import CallError, load_call_config, make_call
from mom.config import fail, optional_config


def parse_args():
    parser = argparse.ArgumentParser(description="Mom calls you about a day on your calendar.")
    parser.add_argument("--date", metavar="YYYY-MM-DD", help="the day to brief (default: today)")
    parser.add_argument(
        "--at",
        metavar="HH:MM",
        help=(
            f"the time of day Mom briefs from, 24-hour (default: now for today; for other days "
            f"{DEFAULT_BRIEFING_TIME}, or 30 min before the first event if that's earlier)"
        ),
    )
    parser.add_argument("--fake-events", action="store_true", help="use a made-up day instead of Google Calendar")
    parser.add_argument("--dry-run", action="store_true", help="print the call instead of placing it")
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        now = briefing_time(args.date, args.at)
    except ValueError as err:
        fail(str(err))

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

    # Another day without --at: a morning briefing, so the first event shouldn't be [now] already.
    if args.at is None and now.date() != datetime.now().astimezone().date():
        now = before_first_event(events, now)

    reason = build_briefing_reason(events, now)
    print(f"📅 {reason.summary} for {reason.dynamic_variables['current_time']}")
    print("   " + reason.dynamic_variables["todays_events"].replace("\n", "\n   "))
    try:
        make_call(config, reason, dry_run=args.dry_run)
    except CallError as err:
        fail(str(err))


if __name__ == "__main__":
    main()
