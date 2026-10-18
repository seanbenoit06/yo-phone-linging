"""Runtime settings the dashboard's Control Panel can change (docs/UI_SPEC.md section 9).

Defaults come from .env. Changes made on the dashboard are saved to state/settings.json
(git-ignored) and override .env from then on, so they survive restarts. Delete that file to go
back to the .env values.

Applying a setting updates the environment variables detector.py reads on every call
(DETECTOR_VISION, DETECTOR_MODE, DETECTOR_LLM) and settings.py's ladder timings (demo_mode).
main.py reads screen_enabled() / webcam_enabled() every loop step.
"""

import json
import os
import sys
import threading

import settings
from common import PROJECT_DIR

STATE_FILE = PROJECT_DIR / "state" / "settings.json"
CHOICES = {"detector_mode": ("lockin", "relaxed"), "detector_llm": ("gemini", "jev")}
FLAGS = ("screen_monitoring", "screenshots", "webcam", "demo_mode")
SCREEN_UNAVAILABLE = "Screen monitoring only works on macOS for now."

_lock = threading.Lock()
_values = {}
_available = {"screen": False, "webcam": False}
_reasons = {}


class SettingsError(Exception):
    """A rejected change. The message is ready to show on the dashboard."""


def load(webcam_available, webcam_reason=None):
    """Called once by main.py at startup: .env defaults, then state/settings.json on top."""
    global _values, _available, _reasons
    available = {"screen": sys.platform == "darwin", "webcam": bool(webcam_available)}
    reasons = {}
    if not available["screen"]:
        reasons["screen"] = SCREEN_UNAVAILABLE
    if not available["webcam"]:
        reasons["webcam"] = webcam_reason or "The camera isn't available on this computer."

    values = _defaults()
    for key, value in _saved().items():
        try:
            _check(key, value)
        except SettingsError as err:
            print(f"⚠️  Ignoring {key} in {STATE_FILE.name}: {err}", flush=True)
            continue
        values[key] = value
    # Something this computer can't do shows as off (not saved, so the preference comes back elsewhere).
    if not available["screen"]:
        values["screen_monitoring"] = values["screenshots"] = False
    if not available["webcam"]:
        values["webcam"] = False

    with _lock:
        _available, _reasons = available, reasons
        _apply(values)


def get():
    with _lock:
        return dict(_values)


def info():
    """The SettingsResponse body: settings, what's available, and why not."""
    with _lock:
        return {"settings": dict(_values), "available": dict(_available), "unavailable_reason": dict(_reasons)}


def update(changes):
    """Validate and apply a subset of settings, save them, and return info(). Raises SettingsError."""
    if not isinstance(changes, dict) or not changes:
        raise SettingsError('Send the settings to change, like {"webcam": true}.')
    for key, value in changes.items():
        _check(key, value)
    with _lock:
        for key, value in changes.items():
            if value is True and key in ("screen_monitoring", "screenshots") and not _available["screen"]:
                raise SettingsError(_reasons["screen"])
            if value is True and key == "webcam" and not _available["webcam"]:
                raise SettingsError(_reasons["webcam"])
        _apply({**_values, **changes})
        _save(_values)
    return info()


def screen_enabled():
    with _lock:
        return bool(_values.get("screen_monitoring")) and _available["screen"]


def webcam_enabled():
    with _lock:
        return bool(_values.get("webcam")) and _available["webcam"]


def _defaults():
    def flag(name):
        return os.getenv(name, "0").strip() == "1"

    def choice(name, field):
        value = os.getenv(name, "").strip().lower()
        return value if value in CHOICES[field] else CHOICES[field][0]

    return {
        "screen_monitoring": True,
        "screenshots": flag("DETECTOR_VISION"),
        "webcam": flag("USE_WEBCAM"),
        "detector_mode": choice("DETECTOR_MODE", "detector_mode"),
        "detector_llm": choice("DETECTOR_LLM", "detector_llm"),
        "demo_mode": flag("DEMO_MODE"),
    }


def _check(key, value):
    if key in FLAGS:
        if not isinstance(value, bool):
            raise SettingsError(f"{key} must be true or false.")
    elif key in CHOICES:
        if value not in CHOICES[key]:
            raise SettingsError(f"{key} must be one of: {', '.join(CHOICES[key])}.")
    else:
        raise SettingsError(f"Unknown setting: {key}.")


def _apply(values):
    """Caller holds _lock."""
    global _values
    os.environ["DETECTOR_VISION"] = "1" if values["screenshots"] else "0"
    os.environ["DETECTOR_MODE"] = values["detector_mode"]
    os.environ["DETECTOR_LLM"] = values["detector_llm"]
    settings.apply_demo_mode(values["demo_mode"])
    _values = values


def _saved():
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as err:
        print(f"⚠️  Ignoring {STATE_FILE.name} ({type(err).__name__}); using .env.", flush=True)
        return {}
    return data if isinstance(data, dict) else {}


def _save(values):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(values, indent=2), encoding="utf-8")
    temp.replace(STATE_FILE)
