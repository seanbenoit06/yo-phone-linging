"""Calendar: Mom calls about upcoming meetings and deadlines from Google Calendar.

Owner: calendar feature. Notes, decisions and status: docs/features/calendar.md

STUB: check() never fires yet. To implement:
    • Google OAuth (desktop client) and the API client go in mom/calendar/;
      credentials.json / token.json stay local (git-ignored)
    • list events starting within a lookahead window; fire when one is close
    • decide how deadlines are represented (all-day events? Google Tasks due dates?)
    • fill the calendar agent's variables, e.g. event_title, minutes_until (all strings)
"""

from typing import Optional

from mom.triggers.base import CallReason


class CalendarTrigger:
    name = "calendar"

    def check(self, now) -> Optional[CallReason]:
        # Example of what to return for an upcoming event:
        # return CallReason(
        #     trigger=self.name,
        #     dedup_key=f"calendar:{event['id']}:{event_start.isoformat()}",
        #     dynamic_variables={"event_title": event["summary"], "minutes_until": str(minutes_until)},
        #     summary=f"{event['summary']} in {minutes_until} min",
        # )
        return None
