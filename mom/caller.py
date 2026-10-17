"""Place a call through ElevenLabs + the Photon SIP trunk, wait for it to end,
and print the transcript. Shared by every trigger and by call_me.py.

Functions raise CallError instead of exiting, so the long-running loop in
mom/run.py can log a failed call and keep going.
"""

import json
import re
import time

from mom.config import fail, load_config, optional_config
from mom.elevenlabs import ApiError, api_request

RINGING_TIMEOUT_SECS = 30
POLL_INTERVAL_SECS = 3
MAX_WAIT_SECS = 15 * 60
MAX_CONSECUTIVE_POLL_ERRORS = 10
# The outbound-call request can stay open while the phone rings, so allow longer than ringing.
CALL_REQUEST_TIMEOUT_SECS = RINGING_TIMEOUT_SECS + 60
FINAL_STATUSES = {"done", "failed"}
E164_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")
CALL_CONFIG_KEYS = [
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_PHONE_NUMBER_ID",
    "MY_PHONE_NUMBER",
    "USER_NAME",
]

DIDNT_RING_HINT = """
📵 Phone didn't ring? ElevenLabs accepted the request, so look between ElevenLabs and Photon:
   1. ElevenLabs dashboard → Conversations: open this conversation_id and check its status / error.
      (On the phone number page you can turn on "SIP Messages" to see the raw SIP response.)
   2. ElevenLabs → Phone Numbers → your Photon number → outbound settings:
      • Address = Photon SIP server + TLS port (e.g. sip.photon.codes:5061), no "sip:"/"sips:" prefix
      • Transport = TLS, Media Encryption = Allowed
      • Username / password = Photon outbound credentials (SHA-256 selected in Photon)
   3. Since "Send Test Call" works: is ELEVENLABS_PHONE_NUMBER_ID the same number, and
      the agent ID the same agent, that you used in the dashboard?
   4. Is MY_PHONE_NUMBER right? Is your phone on Do Not Disturb / Silence Unknown Callers?"""


class CallError(Exception):
    """The call couldn't be placed or followed. The message is ready to show the user."""


def load_call_config():
    """Load and sanity-check everything needed to place a call (exits on bad config)."""
    config = load_config(CALL_CONFIG_KEYS)
    if not E164_PATTERN.match(config["MY_PHONE_NUMBER"]):
        fail("MY_PHONE_NUMBER must be E.164: a +, the country code, then digits only (e.g. +12065551234).")
    if config["ELEVENLABS_PHONE_NUMBER_ID"].startswith("+"):
        fail(
            "ELEVENLABS_PHONE_NUMBER_ID should be the phone_number_id, not the phone number itself.\n"
            "   Run `python list_numbers.py` to find it."
        )
    return config


def agent_id_for(config, trigger):
    """Per-feature agent (ELEVENLABS_AGENT_ID_CALENDAR, ...) if set, else the default agent."""
    return optional_config(f"ELEVENLABS_AGENT_ID_{trigger.upper()}", config["ELEVENLABS_AGENT_ID"])


def mask_phone(number):
    return number[:2] + "•" * (len(number) - 6) + number[-4:]


def make_call(config, reason, dry_run=False):
    """Call the user about reason (a CallReason). Returns the finished conversation,
    or None for a dry run or when the user stops waiting with Ctrl+C."""
    variables = {"user_name": config["USER_NAME"], **reason.dynamic_variables}
    agent_id = agent_id_for(config, reason.trigger)

    print(f"📞 [{reason.trigger}] Calling {mask_phone(config['MY_PHONE_NUMBER'])}: {reason.summary or reason.dedup_key}")
    print(f"   agent={agent_id}  ringing_timeout={RINGING_TIMEOUT_SECS}s")
    print(f"   dynamic_variables={json.dumps(variables, ensure_ascii=False)}")
    if dry_run:
        print("   🧪 Dry run: not placing the call.")
        return None

    try:
        response = place_call(config, agent_id, variables)
    except ApiError as err:
        if err.status_code is None:
            raise CallError(f"{err}\n   The call may still have been placed. Check ElevenLabs → Conversations before retrying.")
        raise CallError(str(err))

    print("\nAPI response:")
    print(json.dumps(response, indent=2, ensure_ascii=False))

    if not response.get("success"):
        raise CallError(
            f"ElevenLabs did not place the call: {response.get('message')}\n"
            "   • Check the agent ID, ELEVENLABS_PHONE_NUMBER_ID and MY_PHONE_NUMBER in .env.\n"
            "   • Check the number's outbound SIP settings in ElevenLabs → Phone Numbers."
        )

    conversation_id = response.get("conversation_id")
    if not conversation_id:
        raise CallError("ElevenLabs said success but returned no conversation_id, so there's nothing to poll." + DIDNT_RING_HINT)

    print(f"\n✅ Call placed. conversation_id: {conversation_id}")
    print(f"   Your phone should ring within a few seconds (it rings for up to {RINGING_TIMEOUT_SECS}s).")

    try:
        conversation = wait_for_call_to_end(config["ELEVENLABS_API_KEY"], conversation_id)
    except KeyboardInterrupt:
        print(f"\nStopped waiting. The call may still be going. conversation_id: {conversation_id}")
        return None
    except ApiError as err:
        raise CallError(f"Couldn't read the conversation: {err}")

    print_result(conversation)
    return conversation


def place_call(config, agent_id, dynamic_variables):
    body = {
        "agent_id": agent_id,
        "agent_phone_number_id": config["ELEVENLABS_PHONE_NUMBER_ID"],
        "to_number": config["MY_PHONE_NUMBER"],
        "conversation_initiation_client_data": {"dynamic_variables": dynamic_variables},
        "telephony_call_config": {"ringing_timeout_secs": RINGING_TIMEOUT_SECS},
    }
    return api_request(
        "POST",
        "/v1/convai/sip-trunk/outbound-call",
        config["ELEVENLABS_API_KEY"],
        timeout=CALL_REQUEST_TIMEOUT_SECS,
        json=body,
    )


def wait_for_call_to_end(api_key, conversation_id):
    """Poll the conversation until its status is done/failed, then return it."""
    print(f"\n⏳ Waiting for the call to end (checking every {POLL_INTERVAL_SECS}s, Ctrl+C to stop)...")
    started = time.monotonic()
    last_status = None
    consecutive_errors = 0
    warned_still_ringing = False

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
            note = "  (call ended, ElevenLabs is processing the transcript)" if status == "processing" else ""
            print(f"   [{elapsed:4.0f}s] status: {status}{note}")
            last_status = status

        if status in FINAL_STATUSES:
            return conversation

        if status == "initiated" and not warned_still_ringing and elapsed > RINGING_TIMEOUT_SECS + 15:
            print(DIDNT_RING_HINT)
            warned_still_ringing = True

        time.sleep(POLL_INTERVAL_SECS)

    raise CallError(
        f"Gave up after {MAX_WAIT_SECS // 60} minutes; the call still hasn't finished.\n"
        f"   Check it in ElevenLabs → Conversations: {conversation_id}"
    )


def print_result(conversation):
    metadata = conversation.get("metadata") or {}
    analysis = conversation.get("analysis") or {}
    transcript = conversation.get("transcript") or []

    print("\n=== Call finished ===")
    print(f"status             : {conversation.get('status')}")
    print(f"duration           : {metadata.get('call_duration_secs', 0)}s")
    if metadata.get("termination_reason"):
        print(f"termination reason : {metadata['termination_reason']}")
    if metadata.get("error"):
        error = metadata["error"]
        print(f"error              : {error.get('code')} {error.get('reason') or ''}".rstrip())
    if analysis.get("transcript_summary"):
        print(f"summary            : {analysis['transcript_summary']}")

    print("\n=== Transcript ===")
    lines = [turn for turn in transcript if turn.get("message")]
    if not lines:
        print("(empty)")
    for turn in lines:
        seconds = int(turn.get("time_in_call_secs") or 0)
        speaker = "Mom" if turn.get("role") == "agent" else "You"
        print(f"[{seconds // 60}:{seconds % 60:02d}] {speaker}: {turn['message']}")

    if conversation.get("status") == "failed" or not lines:
        print(DIDNT_RING_HINT)
