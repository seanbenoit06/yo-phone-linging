"""Place an outbound call through ElevenLabs + the Photon SIP trunk and wait for the result.

Used by call_me.py (CLI) and main.py (the agent loop). Raises instead of exiting,
so one failed call never stops the loop.
"""

import json
import time
from pathlib import Path

from common import ApiError, api_request
from models import CallResult, CallType

RINGING_TIMEOUT_SECS = 30
POLL_INTERVAL_SECS = 3
MAX_WAIT_SECS = 5 * 60
MAX_CONSECUTIVE_POLL_ERRORS = 10
# The outbound-call request can stay open while the phone rings, so allow longer than ringing.
CALL_REQUEST_TIMEOUT_SECS = RINGING_TIMEOUT_SECS + 60
# Still "initiated" this long after placing the call means it never connected.
STUCK_INITIATED_SECS = RINGING_TIMEOUT_SECS + 60
FINAL_STATUSES = {"done", "failed"}
# Sent for variables with no value, so every {{variable}} in the agent prompt always resolves.
EMPTY = "none"

# Owned by the agent-prompt session. Read on every call so wording tweaks apply without a restart.
OPENING_LINES_FILE = Path(__file__).resolve().parent / "agent" / "opening_lines.json"
FALLBACK_OPENING_LINES = {
    "nudge": "{user_name}! It's Mom. Why are you on {distraction} instead of doing {goal}?",
    "callback": "{user_name}, it's Mom again. You promised me you would {last_promise}. Did you do it?",
    "snitch": "Hi! This is Mom.exe, an AI accountability mom, calling about {user_name}.",
}


class _KeepMissing(dict):
    """format_map helper: leave unknown {placeholders} as-is instead of raising."""

    def __missing__(self, key):
        return "{" + key + "}"


class CallError(Exception):
    """ElevenLabs didn't place the call, or the call never finished.

    response holds the raw API response when there is one.
    """

    def __init__(self, message, response=None):
        super().__init__(message)
        self.response = response


def build_dynamic_variables(user_name, goal, distraction, minutes_distracted,
                            call_type=CallType.NUDGE, last_promise=None, past_excuses=None):
    """Every {{variable}} the agent prompt may use. Always send all of them."""
    variables = {
        "user_name": user_name,
        "goal": goal or EMPTY,
        "distraction": distraction or EMPTY,
        "minutes_distracted": str(minutes_distracted),
        "call_type": call_type.value,
        "last_promise": last_promise or EMPTY,
        "past_excuses": past_excuses or EMPTY,
    }
    variables["opening_line"] = _opening_line(call_type, variables)
    return variables


def _opening_line(call_type, variables):
    """First thing Mom says. The dashboard First message is exactly {{opening_line}}."""
    key = call_type.value
    if call_type == CallType.CALLBACK and variables["last_promise"] == EMPTY:
        key = CallType.NUDGE.value  # the callback opener says the promise out loud
    try:
        lines = json.loads(OPENING_LINES_FILE.read_text())
        return lines[key].format_map(_KeepMissing(variables))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return FALLBACK_OPENING_LINES[key].format_map(variables)


def place_call(config, to_number, variables):
    """Start the call and return the API response (has conversation_id).

    Raises ApiError (HTTP / network) or CallError (ElevenLabs refused).
    """
    body = {
        "agent_id": config["ELEVENLABS_AGENT_ID"],
        "agent_phone_number_id": config["ELEVENLABS_PHONE_NUMBER_ID"],
        "to_number": to_number,
        "conversation_initiation_client_data": {"dynamic_variables": variables},
        "telephony_call_config": {"ringing_timeout_secs": RINGING_TIMEOUT_SECS},
    }
    response = api_request(
        "POST",
        "/v1/convai/sip-trunk/outbound-call",
        config["ELEVENLABS_API_KEY"],
        timeout=CALL_REQUEST_TIMEOUT_SECS,
        json=body,
    )
    if not response.get("success"):
        raise CallError(f"ElevenLabs did not place the call: {response.get('message')}", response)
    if not response.get("conversation_id"):
        raise CallError("ElevenLabs said success but returned no conversation_id.", response)
    return response


def wait_for_call(api_key, conversation_id, on_status=None):
    """Poll until the conversation is done/failed and return it (raw API JSON).

    on_status(status, elapsed_secs) is called whenever the status changes.
    Raises ApiError or CallError.
    """
    started = time.monotonic()
    last_status = None
    consecutive_errors = 0

    while time.monotonic() - started < MAX_WAIT_SECS:
        elapsed = time.monotonic() - started
        try:
            conversation = api_request("GET", f"/v1/convai/conversations/{conversation_id}", api_key)
            consecutive_errors = 0
        except ApiError as err:
            # 404 right after placing the call (not created yet), rate limits, server and
            # network hiccups are usually temporary, so retry a few times before giving up.
            retryable = err.status_code in (None, 404, 429) or err.status_code >= 500
            consecutive_errors += 1
            if not retryable or consecutive_errors > MAX_CONSECUTIVE_POLL_ERRORS:
                raise
            time.sleep(POLL_INTERVAL_SECS)
            continue

        status = conversation.get("status")
        if status != last_status:
            if on_status:
                on_status(status, elapsed)
            last_status = status

        if status in FINAL_STATUSES:
            return conversation
        if status == "initiated" and elapsed > STUCK_INITIATED_SECS:
            raise CallError(f"Call never connected (still 'initiated' after {int(elapsed)}s).")

        time.sleep(POLL_INTERVAL_SECS)

    raise CallError(f"Gave up after {MAX_WAIT_SECS // 60} minutes; the call still hasn't finished.")


def to_call_result(conversation, call_type):
    """Boil the raw conversation JSON down to what the brain needs."""
    metadata = conversation.get("metadata") or {}
    analysis = conversation.get("analysis") or {}
    collected = analysis.get("data_collection_results") or {}
    transcript = [turn for turn in conversation.get("transcript") or [] if turn.get("message")]

    def collected_value(field_id):
        value = (collected.get(field_id) or {}).get("value")
        return str(value).strip() if value not in (None, "") else None

    # A voicemail greeting shows up as a "user" turn, so it must not count as answered.
    answered = any(turn.get("role") == "user" for turn in transcript) and not _hit_voicemail(conversation)

    return CallResult(
        conversation_id=conversation.get("conversation_id", ""),
        call_type=call_type,
        status=conversation.get("status", "failed"),
        answered=answered,
        duration_secs=int(metadata.get("call_duration_secs") or 0),
        transcript=transcript,
        summary=analysis.get("transcript_summary"),
        promised_step=collected_value("promised_step"),
        excuse=collected_value("excuse"),
    )


def _hit_voicemail(conversation):
    """True if the agent's voicemail_detection tool fired (or the call ended on voicemail)."""
    reason = str((conversation.get("metadata") or {}).get("termination_reason") or "")
    if "voicemail" in reason.lower():
        return True
    for turn in conversation.get("transcript") or []:
        for tool_call in turn.get("tool_calls") or []:
            if "voicemail" in json.dumps(tool_call).lower():
                return True
    return False


def call(config, to_number, call_type, variables, on_status=None):
    """Place a call and block until it ends. main.py runs this in a thread."""
    response = place_call(config, to_number, variables)
    conversation = wait_for_call(config["ELEVENLABS_API_KEY"], response["conversation_id"], on_status)
    return to_call_result(conversation, call_type)
