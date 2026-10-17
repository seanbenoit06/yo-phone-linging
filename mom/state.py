"""Remember which situations Mom already called about and when she last called,
so restarts don't re-call and features can't call back to back.

Stored in state/state.json (git-ignored). Dry runs keep state in memory only.
"""

import json
from datetime import datetime

from mom.config import PROJECT_DIR

STATE_FILE = PROJECT_DIR / "state" / "state.json"


class State:
    def __init__(self, path=STATE_FILE):
        """path=None keeps everything in memory (used for dry runs)."""
        self.path = path
        self.data = {"handled": {}, "last_call_at": None}
        if path and path.exists():
            self.data.update(json.loads(path.read_text(encoding="utf-8")))

    def is_handled(self, dedup_key):
        return dedup_key in self.data["handled"]

    def seconds_since_last_call(self, now):
        """None if Mom has never called."""
        if not self.data["last_call_at"]:
            return None
        return (now - datetime.fromisoformat(self.data["last_call_at"])).total_seconds()

    def record_call(self, reason, now):
        self.data["handled"][reason.dedup_key] = {"trigger": reason.trigger, "at": now.isoformat()}
        self.data["last_call_at"] = now.isoformat()
        self._save()

    def _save(self):
        if not self.path:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
