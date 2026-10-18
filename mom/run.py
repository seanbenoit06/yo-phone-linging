"""Mom.exe main loop: ask each enabled trigger whether Mom should call, and call.

Usage:
    python -m mom.run                          # all triggers
    python -m mom.run --triggers calendar      # just one feature
    python -m mom.run --dry-run --once         # one pass, print instead of calling

Rules every feature gets for free:
    • at most one call per dedup_key, ever (survives restarts via state/state.json)
    • at least --cooldown-minutes between any two calls, across all features
    • one call at a time (make_call blocks until the call ends)
    • a trigger that raises is logged and skipped; the others keep running
"""

import argparse
import time
import traceback
from datetime import datetime

from mom.caller import CallError, load_call_config, make_call
from mom.state import State
from mom.triggers import TRIGGERS, load_trigger

DEFAULT_INTERVAL_SECS = 60
DEFAULT_COOLDOWN_MINUTES = 10


def parse_args():
    parser = argparse.ArgumentParser(description="Run Mom.exe: watch triggers and call when needed.")
    parser.add_argument(
        "--triggers",
        default=",".join(TRIGGERS),
        help=f"comma-separated triggers to enable (default: {','.join(TRIGGERS)})",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the calls Mom would make instead of calling")
    parser.add_argument("--once", action="store_true", help="check every trigger once, then exit")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL_SECS, help="seconds between checks (default: 60)")
    parser.add_argument(
        "--cooldown-minutes",
        type=float,
        default=DEFAULT_COOLDOWN_MINUTES,
        help="minimum minutes between any two calls (default: 10)",
    )
    return parser.parse_args()


def run_once(triggers, config, state, cooldown_secs, dry_run):
    for trigger in triggers:
        now = datetime.now().astimezone()
        try:
            reason = trigger.check(now)
        except Exception:
            print(f"⚠️  [{trigger.name}] check() raised; skipping it this round:")
            traceback.print_exc()
            continue

        if reason is None or state.is_handled(reason.dedup_key):
            continue

        since_last = state.seconds_since_last_call(now)
        if since_last is not None and since_last < cooldown_secs:
            print(f"⏸️  [{trigger.name}] wants to call ({reason.summary or reason.dedup_key}) but cooldown has "
                  f"{(cooldown_secs - since_last) / 60:.0f} min left.")
            continue

        # Record before calling so a failed or interrupted call isn't retried every interval.
        state.record_call(reason, now)
        try:
            make_call(config, reason, dry_run=dry_run)
        except CallError as err:
            print(f"\n❌ [{trigger.name}] Call failed: {err}")


def main():
    args = parse_args()
    names = [name.strip() for name in args.triggers.split(",") if name.strip()]
    unknown = [name for name in names if name not in TRIGGERS]
    if unknown:
        raise SystemExit(f"Unknown trigger(s): {', '.join(unknown)}. Known: {', '.join(TRIGGERS)}")

    config = load_call_config()
    triggers = [load_trigger(name) for name in names]
    state = State(path=None) if args.dry_run else State()
    cooldown_secs = args.cooldown_minutes * 60

    mode = " (dry run)" if args.dry_run else ""
    print(f"👀 Mom.exe is watching{mode}: {', '.join(names)}  (every {args.interval}s, Ctrl+C to stop)")
    try:
        while True:
            run_once(triggers, config, state, cooldown_secs, args.dry_run)
            if args.once:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n👋 Mom.exe stopped watching.")


if __name__ == "__main__":
    main()
