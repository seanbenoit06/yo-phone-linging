"""Compatibility shim: the shared helpers live in mom/config.py and mom/elevenlabs.py.

The root-level agent modules (main.py, caller.py, texter.py, detector.py, webcam.py, ...)
import from here, so there is one implementation of .env loading and ElevenLabs HTTP calls.
"""

from mom.config import ENV_FILE, PROJECT_DIR, fail, load_config, optional_config  # noqa: F401
from mom.elevenlabs import (  # noqa: F401
    API_BASE,
    DEFAULT_TIMEOUT_SECS,
    ApiError,
    api_request,
    describe_http_error,
)
