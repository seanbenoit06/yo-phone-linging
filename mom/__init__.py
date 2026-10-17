"""Mom.exe: an AI agent that phone-calls you when you procrastinate.

Shared core: config, ElevenLabs client, caller, state, run loop.
Features live in mom/triggers/. See CLAUDE.md for how the pieces fit.
"""

try:
    # Verify HTTPS with the OS certificate store instead of certifi's bundle, so antivirus
    # TLS scanning (e.g. Norton Web Shield) or corporate proxies don't break every request.
    # Done here so every mom.* import (ElevenLabs, Google, ...) gets it before any request.
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # Python < 3.10, or not installed
    pass
