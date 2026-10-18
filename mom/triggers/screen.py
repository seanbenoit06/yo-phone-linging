"""Screen monitor: Mom calls when you've been off task (e.g. TikTok instead of homework).

Owner: screen feature. Notes, decisions and status: docs/features/screen.md

STUB: check() never fires yet. To implement:
    • detect the active app / window title / browser site (OS-specific code goes in
      mom/screen/, imported lazily so other platforms and features still run)
    • decide what counts as distracted (a blocklist / allowlist in .env is a fine start)
    • track how long you've been distracted and fire once it passes a threshold
    • fill the agent's variables: goal, distraction, minutes_distracted (all strings)
"""

from typing import Optional

from mom.triggers.base import CallReason


class ScreenTrigger:
    name = "screen"

    def check(self, now) -> Optional[CallReason]:
        # Example of what to return once distraction is detected:
        # return CallReason(
        #     trigger=self.name,
        #     dedup_key=f"screen:{distraction}:{distracted_since.isoformat()}",
        #     dynamic_variables={"goal": goal, "distraction": distraction, "minutes_distracted": str(minutes)},
        #     summary=f"{minutes} min on {distraction}",
        # )
        return None
