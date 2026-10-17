"""Load .env and exit with a readable message when something is missing."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_DIR / ".env"

# Windows falls back to cp1252 when output is redirected (logs, pipes), which can't print
# the emoji used in messages. Force UTF-8 so output works the same on every OS.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def fail(message):
    print(f"\n❌ {message}", file=sys.stderr)
    sys.exit(1)


def load_config(required_keys):
    """Return {key: value} for required_keys, or exit listing what's missing."""
    load_dotenv(ENV_FILE)
    config = {}
    missing = []
    for key in required_keys:
        value = os.getenv(key, "").strip()
        # Values still starting with "your_" were copied from .env.example unchanged.
        if not value or value.startswith("your_"):
            missing.append(key)
        else:
            config[key] = value

    if missing:
        lines = ["Missing environment variables:"]
        lines += [f"   • {key}" for key in missing]
        if not ENV_FILE.exists():
            lines.append("   No .env file found. Create one with: cp .env.example .env")
        lines.append(f"   Fill them in {ENV_FILE}")
        fail("\n".join(lines))
    return config


def optional_config(key, default=None):
    """Return an optional .env value, or default when unset / still a placeholder."""
    load_dotenv(ENV_FILE)
    value = os.getenv(key, "").strip()
    if not value or value.startswith("your_"):
        return default
    return value
