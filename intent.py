"""Turn one of your iMessages into an Intent with plain regex rules (no LLM).

Usage:
    python intent.py "Finishing CSE homework by 9 PM"
    python intent.py "I'm doing CSE homework until 9" --now "2026-10-17 22:30"
    python intent.py                     # run the built-in examples
"""

import argparse
import re
from datetime import datetime, timedelta

from models import Intent, IntentKind

STOP = re.compile(
    r"""^(?:ok(?:ay)?\W+)?(?:i'?m\s+|i\s+am\s+|all\s+|i\s+)?
        (?:done|finished|stop|quit|end\s+session|stop\s+session)
        (?:\s+for\s+(?:today|tonight|now))?(?:\s+mom)?\W*$
      | ^stop\b""",
    re.IGNORECASE | re.VERBOSE,
)

TIME = r"(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>[ap])\.?\s?m\b\.?|(?P<hour24>\d{1,2})(?::(?P<minute24>\d{2}))?\b|(?P<word>noon|midnight)\b"
DEADLINE = re.compile(rf"\b(?:by|until|till|til|'til|before)\s+(?:{TIME})", re.IGNORECASE)
EVENING = re.compile(r"\b(?:tonight|this\s+evening)\b", re.IGNORECASE)

# Stripped from the front of the text before the deadline to leave just the goal.
FILLER = re.compile(
    r"^(?:(?:ok(?:ay)?|so|mom|ma|i'?m|im|i\s+am|i'?ll|i\s+will|i'?m\s+gonna|gonna|going\s+to|need\s+to|have\s+to|"
    r"gotta|will|about\s+to|trying\s+to|try\s+to|let\s+me|lemme)\b[\s,]*)*",
    re.IGNORECASE,
)
VERB = re.compile(
    r"^(?:finish(?:ing)?|do(?:ing)?|work(?:ing)?\s+on|study(?:ing)?(?:\s+for)?|writ(?:e|ing)|read(?:ing)?|"
    r"start(?:ing)?|grind(?:ing)?|focus(?:ing)?\s+on|complet(?:e|ing)|get(?:ting)?\s+through)\s+",
    re.IGNORECASE,
)
DETERMINER = re.compile(r"^(?:my|the|this|some)\s+", re.IGNORECASE)

NOT_DISTRACTED = re.compile(
    r"""\b(?:i'?m|im|i\s+am)\s+(?:actually\s+|literally\s+|really\s+|just\s+|still\s+)*
          (?:working|studying|on\s+task|focus(?:ed|ing)|doing\s+(?:my\s+)?(?:work|homework|hw)
            |watching\s+(?:a\s+|the\s+|my\s+)?(?:lecture|tutorial))\b
      | \b(?:this|it|that)(?:'s|\s+is|\s+was)\s+(?:for|part\s+of)\s+(?:a\s+|my\s+)?
          (?:class|school|work|homework|hw|research|project|assignment)\b
      | \b(?:this|it)(?:'s|\s+is)\s+(?:work|homework|research|productive|educational)\b
      | \bnot\s+(?:distracted|procrastinating|slacking|wasting\s+time)\b""",
    re.IGNORECASE | re.VERBOSE,
)


def parse(text: str, now: datetime) -> Intent:
    """Classify one message. `until` keeps the same tzinfo as `now` (naive stays naive)."""
    clean = _normalize(text)

    if STOP.search(clean):
        return Intent(kind=IntentKind.STOP_SESSION, text=text)

    match = DEADLINE.search(clean)
    if match:
        goal = _goal(clean[: match.start()])
        until = _deadline(match, now, evening=bool(EVENING.search(clean)))
        if goal and until:
            return Intent(kind=IntentKind.START_SESSION, text=text, goal=goal, until=until)

    if NOT_DISTRACTED.search(clean):
        return Intent(kind=IntentKind.NOT_DISTRACTED, text=text)

    return Intent(kind=IntentKind.OTHER, text=text)


def _normalize(text):
    # iPhone autocorrects ' to ’.
    return re.sub(r"\s+", " ", text.replace("’", "'").replace("‘", "'")).strip()


def _goal(before_deadline):
    goal = FILLER.sub("", before_deadline.strip())
    goal = VERB.sub("", goal)
    goal = DETERMINER.sub("", goal)
    return goal.strip(" ,.!?-:;") or None


def _deadline(match, now, evening):
    """Next time the deadline happens after `now`, or None if it isn't a real time."""
    if match["word"]:
        hours, minute = ([12] if match["word"].lower() == "noon" else [0]), 0
    else:
        hour = int(match["hour"] or match["hour24"])
        minute = int(match["minute"] or match["minute24"] or 0)
        if minute > 59:
            return None
        if match["ampm"]:
            if not 1 <= hour <= 12:
                return None
            hours = [hour % 12 + (12 if match["ampm"].lower() == "p" else 0)]
        elif hour == 0 or 13 <= hour <= 23:
            hours = [hour]
        elif 1 <= hour <= 12:
            # "until 9" means whichever 9 comes next, unless "tonight" says PM.
            hours = [hour % 12 + 12] if evening else [hour % 12, hour % 12 + 12]
        else:
            return None

    for days in (0, 1):
        for hour in sorted(hours):
            candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days)
            if candidate > now:
                return candidate
    return None


# ---------- manual test ----------

EXAMPLES = [
    ("Finishing CSE homework by 9 PM", IntentKind.START_SESSION),
    ("I'm doing CSE homework until 9", IntentKind.START_SESSION),
    ("I’m finishing my CSE homework by 9:30pm", IntentKind.START_SESSION),
    ("working on the essay till 11 tonight", IntentKind.START_SESSION),
    ("CSE homework until 21:00", IntentKind.START_SESSION),
    ("I'm actually working", IntentKind.NOT_DISTRACTED),
    ("this is for class", IntentKind.NOT_DISTRACTED),
    ("mom it's for class i swear", IntentKind.NOT_DISTRACTED),
    ("I'm not distracted", IntentKind.NOT_DISTRACTED),
    ("done", IntentKind.STOP_SESSION),
    ("Done!", IntentKind.STOP_SESSION),
    ("stop", IntentKind.STOP_SESSION),
    ("I'm done for today", IntentKind.STOP_SESSION),
    ("hi mom", IntentKind.OTHER),
    ("I'm not working lol", IntentKind.OTHER),
    ("?", IntentKind.OTHER),
]


def _show(intent):
    line = f"{intent.kind.name:<15} {intent.text!r}"
    if intent.kind == IntentKind.START_SESSION:
        line += f"\n{'':<15} goal={intent.goal!r}  until={intent.until:%a %Y-%m-%d %H:%M}"
    return line


def main():
    parser = argparse.ArgumentParser(description="Parse one iMessage into an Intent.")
    parser.add_argument("text", nargs="?", help="the message; omit to run the built-in examples")
    parser.add_argument("--now", help='pretend it is this local time, e.g. "2026-10-17 22:30"')
    args = parser.parse_args()
    now = datetime.fromisoformat(args.now) if args.now else datetime.now()

    if args.text is not None:
        print(_show(parse(args.text, now)))
        return

    print(f"now = {now:%a %Y-%m-%d %H:%M}\n")
    failures = 0
    for text, expected in EXAMPLES:
        intent = parse(text, now)
        ok = intent.kind == expected
        failures += not ok
        print(("✅ " if ok else f"❌ expected {expected.name}\n   ") + _show(intent))
    print(f"\n{len(EXAMPLES) - failures}/{len(EXAMPLES)} examples OK")


if __name__ == "__main__":
    main()
