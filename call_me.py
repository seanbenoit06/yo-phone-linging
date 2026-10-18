"""Mom.exe: make ElevenLabs call your phone through the Photon SIP trunk,
wait for the call to end, then print the transcript.

Usage:
    python call_me.py
    python call_me.py --goal "CSE homework" --distraction "TikTok"
    python call_me.py --dry-run      # print the dynamic variables instead of calling
    python call_me.py --to +12065551234 --name Alex   # call someone else (they must agree first)
"""

import argparse
import json
import re

from caller import (
    RINGING_TIMEOUT_SECS,
    CallError,
    build_dynamic_variables,
    place_call,
    wait_for_call,
)
from common import ApiError, fail, load_config

MINUTES_DISTRACTED = "5"
E164_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")

DIDNT_RING_HINT = """
📵 Phone didn't ring? ElevenLabs accepted the request, so look between ElevenLabs and Photon:
   1. ElevenLabs dashboard → Conversations: open this conversation_id and check its status / error.
      (On the phone number page you can turn on "SIP Messages" to see the raw SIP response.)
   2. ElevenLabs → Phone Numbers → your Photon number → outbound settings:
      • Address = Photon SIP server + TLS port (e.g. sip.photon.codes:5061), no "sip:"/"sips:" prefix
      • Transport = TLS, Media Encryption = Allowed
      • Username / password = Photon outbound credentials (SHA-256 selected in Photon)
   3. Since "Send Test Call" works: is ELEVENLABS_PHONE_NUMBER_ID the same number, and
      ELEVENLABS_AGENT_ID the same agent, that you used in the dashboard?
   4. Is MY_PHONE_NUMBER right? Is your phone on Do Not Disturb / Silence Unknown Callers?"""


def parse_args():
    parser = argparse.ArgumentParser(description="Make Mom.exe call you.")
    parser.add_argument("--goal", default="CSE homework", help='what you should be doing (default: "CSE homework")')
    parser.add_argument("--distraction", default="TikTok", help='what you are doing instead (default: "TikTok")')
    parser.add_argument("--dry-run", action="store_true", help="print the call instead of placing it")
    parser.add_argument("--to", help="E.164 number to call instead of MY_PHONE_NUMBER (they must agree first)")
    parser.add_argument("--name", help="name Mom uses instead of USER_NAME")
    return parser.parse_args()


def mask_phone(number):
    return number[:2] + "•" * (len(number) - 6) + number[-4:]


def print_api_response(response):
    print("\nAPI response:")
    print(json.dumps(response, indent=2, ensure_ascii=False))


def print_status(status, elapsed):
    note = "  (call ended, ElevenLabs is processing the transcript)" if status == "processing" else ""
    print(f"   [{elapsed:4.0f}s] status: {status}{note}")


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


def main():
    args = parse_args()
    config = load_config([
        "ELEVENLABS_API_KEY",
        "ELEVENLABS_AGENT_ID",
        "ELEVENLABS_PHONE_NUMBER_ID",
        "MY_PHONE_NUMBER",
        "USER_NAME",
    ])

    to_number = args.to or config["MY_PHONE_NUMBER"]
    name = args.name or config["USER_NAME"]
    if not E164_PATTERN.match(to_number):
        source = "--to" if args.to else "MY_PHONE_NUMBER"
        fail(f"{source} must be E.164: a +, the country code, then digits only (e.g. +12065551234).")
    if config["ELEVENLABS_PHONE_NUMBER_ID"].startswith("+"):
        fail(
            "ELEVENLABS_PHONE_NUMBER_ID should be the phone_number_id, not the phone number itself.\n"
            "   Run `python list_numbers.py` to find it."
        )

    print(f"📞 Asking ElevenLabs to call {name} at {mask_phone(to_number)}")
    print(
        f"   goal={args.goal!r}  distraction={args.distraction!r}  "
        f"minutes_distracted={MINUTES_DISTRACTED!r}  ringing_timeout={RINGING_TIMEOUT_SECS}s"
    )
    variables = build_dynamic_variables(name, args.goal, args.distraction, MINUTES_DISTRACTED)

    if args.dry_run:
        print("\n(dry run, no call placed) dynamic variables:")
        print(json.dumps(variables, indent=2, ensure_ascii=False))
        return

    try:
        response = place_call(config, to_number, variables)
    except ApiError as err:
        if err.status_code is None:
            fail(f"{err}\n   The call may still have been placed. Check ElevenLabs → Conversations before retrying.")
        fail(str(err))
    except CallError as err:
        if err.response is not None:
            print_api_response(err.response)
        fail(
            f"{err}\n"
            "   • Check ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID and MY_PHONE_NUMBER in .env.\n"
            "   • Check the number's outbound SIP settings in ElevenLabs → Phone Numbers."
        )

    print_api_response(response)
    conversation_id = response["conversation_id"]
    print(f"\n✅ Call placed. conversation_id: {conversation_id}")
    print(f"   Your phone should ring within a few seconds (it rings for up to {RINGING_TIMEOUT_SECS}s).")
    print("\n⏳ Waiting for the call to end (Ctrl+C to stop)...")

    try:
        conversation = wait_for_call(config["ELEVENLABS_API_KEY"], conversation_id, on_status=print_status)
    except KeyboardInterrupt:
        print(f"\nStopped waiting. The call may still be going. conversation_id: {conversation_id}")
        return
    except ApiError as err:
        fail(f"Couldn't read the conversation: {err}")
    except CallError as err:
        fail(f"{err}\n   conversation_id: {conversation_id}" + DIDNT_RING_HINT)

    print_result(conversation)


if __name__ == "__main__":
    main()
