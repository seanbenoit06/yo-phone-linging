"""Registry of features that can make Mom call.

Each trigger is imported only when enabled, so one feature's OS-specific or
missing dependencies never break running another feature on its own.
To add a feature: create mom/triggers/<name>.py with a Trigger class and add one line here.
"""

import importlib

TRIGGERS = {
    "screen": "mom.triggers.screen:ScreenTrigger",
    "calendar": "mom.triggers.calendar:CalendarTrigger",
}


def load_trigger(name):
    """Import and construct the trigger registered under name."""
    module_path, class_name = TRIGGERS[name].split(":")
    module = importlib.import_module(module_path)
    return getattr(module, class_name)()
