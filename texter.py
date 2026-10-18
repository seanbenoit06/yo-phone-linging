"""iMessage in and out through a Photon (Beta) shared iMessage line.

A shared line can't start a conversation: you text the agent's number first.
After that, the agent texts back in that same conversation.

Usage:
    python texter.py                        # echo bot: replies with whatever you text it
    python texter.py --proactive-test       # text it once; 60s later it texts you "?" on its own
    python texter.py --proactive-test --wait 600
    python texter.py --send "hello"         # send one text without texting first in this run
"""

import argparse
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import requests

from common import fail, load_config
from models import InboundText
from settings import POLL_TEXTS_EVERY_SECS

API_BASE = "https://api.photon.codes/v1"
REQUIRED_KEYS = ["PHOTON_API_KEY", "PHOTON_PROJECT_ID", "MY_PHONE_NUMBER"]
POLL_TIMEOUT_SECS = 5
SEND_TIMEOUT_SECS = 15
SEND_ATTEMPTS = 2
PAGE_SIZE = 100
MAX_PAGES_PER_POLL = 5
# Texts created before this process started (minus clock-skew slack) are ignored.
STARTUP_LOOKBACK_SECS = 5
# listMessages is eventually consistent, so each poll re-reads a window before the newest text seen.
POLL_OVERLAP_SECS = 60
DEFAULT_RETRY_AFTER_SECS = 5
DELIVERY_WAIT_SECS = 30
FINAL_SEND_STATUSES = {"delivered", "failed"}

HINTS = {
    401: "Photon rejected PHOTON_API_KEY. Check .env (whole key, no quotes) and that the key isn't revoked or expired.",
    "INSUFFICIENT_SCOPE": "The API key needs project:read and project:write (Photon dashboard → API keys).",
    "RESOURCE_MISMATCH": "PHOTON_PROJECT_ID doesn't match the project the API key belongs to.",
    "SHARED_LINE_INBOUND_REQUIRED": "Text the agent's number from your phone first; a shared line can't start the conversation.",
    "SHARED_LINE_NOT_ASSIGNED": "Your number has no shared line. Photon dashboard → iMessage → add your number → assign.",
}


class PhotonError(Exception):
    """A Photon request failed. status_code is None for network errors."""

    def __init__(self, status_code, code, message, retry_after=DEFAULT_RETRY_AFTER_SECS):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.retry_after = retry_after

    @property
    def retryable(self):
        return self.status_code is None or self.status_code == 429 or self.status_code >= 500


_config = None
_started_at = datetime.now(timezone.utc) - timedelta(seconds=STARTUP_LOOKBACK_SECS)
_newest_seen_at = None
_seen_ids = set()
_paused_until = 0.0  # time.monotonic() value; polls return [] until then after a 429
_conversation = None  # {"space_id", "agent_id"} from the latest text you sent the agent


def send_text(text: str) -> None:
    """Text MY_PHONE_NUMBER. Returns once Photon accepts it (delivery is async). Raises PhotonError."""
    _send(text)


def poll_inbound() -> list[InboundText]:
    """Return new texts from MY_PHONE_NUMBER, oldest first, each one only once.

    Network hiccups, 5xx and 429 return [] so a polling loop keeps going;
    config problems (401/403/404/422) raise PhotonError.
    """
    global _paused_until
    if time.monotonic() < _paused_until:
        return []

    since = _started_at
    if _newest_seen_at:
        since = max(since, _newest_seen_at - timedelta(seconds=POLL_OVERLAP_SECS))
    params = {
        "createdSince": _rfc3339(since),
        "direction": "received",
        "platform": "imessage",
        "order": "asc",
        "pageSize": PAGE_SIZE,
    }

    texts = []
    try:
        for _ in range(MAX_PAGES_PER_POLL):
            page = _request("GET", "/messages", POLL_TIMEOUT_SECS, params=params)
            for message in page.get("items", []):
                text = _to_inbound_text(message)
                if text:
                    texts.append(text)
            if not page.get("nextPageToken"):
                break
            params["pageToken"] = page["nextPageToken"]
    except PhotonError as err:
        if not err.retryable:
            raise
        if err.status_code == 429:
            _paused_until = time.monotonic() + err.retry_after
        print(f"⚠️  poll_inbound: {err}", file=sys.stderr)
        # Return what we already parsed; their ids are marked seen, so dropping them would lose them.
    return texts


# ---------- internals ----------

def _to_inbound_text(message):
    """Return an InboundText for a new plain text from MY_PHONE_NUMBER, else None."""
    global _newest_seen_at
    if message.get("id") in _seen_ids or not _is_from_me(message):
        return None
    content = message.get("content") or {}
    # Messages from iPhone can end with a stray newline.
    text = (content.get("text") or "").strip() if content.get("type") == "text" else ""
    if not text:
        return None

    _seen_ids.add(message["id"])
    _remember_conversation(message)
    created_at = _parse_time(message["createdAt"])
    if _newest_seen_at is None or created_at > _newest_seen_at:
        _newest_seen_at = created_at
    # Local naive time, to compare with datetime.now() in main.py / brain.py.
    received_at = created_at.astimezone().replace(tzinfo=None)
    return InboundText(message_id=message["id"], text=text, received_at=received_at)


def _is_from_me(message):
    sent_by = message.get("sentBy") or {}
    space = message.get("space") or {}
    return (
        message.get("platform") == "imessage"
        and message.get("status") == "received"
        and sent_by.get("handle") == _get_config()["MY_PHONE_NUMBER"]
        and space.get("kind") == "direct"
    )


def _remember_conversation(message):
    global _conversation
    received_by = message.get("receivedBy") or {}
    if received_by.get("id"):
        _conversation = {"space_id": message["space"]["id"], "agent_id": received_by["id"]}


def _find_conversation():
    """Look up the conversation from your most recent text, for sends before any poll saw one."""
    page = _request(
        "GET",
        "/messages",
        POLL_TIMEOUT_SECS,
        params={"direction": "received", "platform": "imessage", "order": "desc", "pageSize": PAGE_SIZE},
    )
    for message in page.get("items", []):
        if _is_from_me(message):
            _remember_conversation(message)
            if _conversation:
                return _conversation
    raise PhotonError(
        None,
        "NO_CONVERSATION",
        "No iMessage from MY_PHONE_NUMBER found yet.\n   " + HINTS["SHARED_LINE_INBOUND_REQUIRED"],
    )


def _send(text):
    """Send text and return Photon's Message (status "accepted" right after the send)."""
    conversation = _conversation or _find_conversation()
    body = {
        "spaceId": conversation["space_id"],
        "senderId": conversation["agent_id"],
        "content": {"type": "text", "format": "plain", "text": text},
    }
    # Same key on retry, so a retried send can't double-text.
    headers = {"Idempotency-Key": f"mom-exe:{uuid.uuid4()}"}
    for attempt in range(1, SEND_ATTEMPTS + 1):
        try:
            return _request("POST", "/messages", SEND_TIMEOUT_SECS, headers=headers, json=body)
        except PhotonError as err:
            if attempt == SEND_ATTEMPTS or not err.retryable:
                raise
            time.sleep(min(err.retry_after, 5))


def _request(method, path, timeout, headers=None, **kwargs):
    config = _get_config()
    url = f"{API_BASE}/projects/{config['PHOTON_PROJECT_ID']}{path}"
    headers = {"Authorization": f"Bearer {config['PHOTON_API_KEY']}", **(headers or {})}
    try:
        response = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
    except requests.exceptions.Timeout:
        raise PhotonError(None, None, f"Photon didn't answer within {timeout}s (timeout).")
    except requests.exceptions.ConnectionError:
        raise PhotonError(None, None, "Couldn't reach api.photon.codes. Check your internet / VPN.")

    if not response.ok:
        raise _problem(response)
    try:
        return response.json()
    except ValueError:
        raise PhotonError(response.status_code, None, f"Expected JSON but got: {response.text[:300]}")


def _problem(response):
    """Turn an RFC 9457 problem response into a readable PhotonError."""
    try:
        body = response.json()
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    status = response.status_code
    code = body.get("code")
    detail = body.get("detail") or body.get("title") or response.text[:300] or "(empty response body)"

    message = f"Photon {status}{' ' + code if code else ''}: {detail}"
    hint = HINTS.get(code) or HINTS.get(status)
    if hint:
        message += f"\n   {hint}"
    if response.headers.get("X-Request-ID"):
        message += f"\n   request id: {response.headers['X-Request-ID']}"

    retry_after = response.headers.get("Retry-After", "")
    retry_after = int(retry_after) if retry_after.isdigit() else DEFAULT_RETRY_AFTER_SECS
    return PhotonError(status, code, message, retry_after)


def _get_config():
    global _config
    if _config is None:
        _config = load_config(REQUIRED_KEYS)
    return _config


def _rfc3339(moment):
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _mask(number):
    return number[:2] + "•" * (len(number) - 6) + number[-4:]


# ---------- manual tests ----------

def _wait_for_delivery(message_id):
    """Poll a sent Message until delivered/failed. Returns the last Message seen."""
    deadline = time.monotonic() + DELIVERY_WAIT_SECS
    last_status = None
    while True:
        message = _request("GET", f"/messages/{message_id}", POLL_TIMEOUT_SECS)
        if message.get("status") != last_status:
            last_status = message.get("status")
            print(f"   status: {last_status}")
        if last_status in FINAL_SEND_STATUSES or time.monotonic() > deadline:
            return message
        time.sleep(1)


def _send_and_report(text):
    message = _send(text)
    print(f"   Photon accepted it. message id: {message.get('id')}")
    final = _wait_for_delivery(message["id"])
    if final.get("status") == "failed":
        failure = final.get("failure") or {}
        fail(f"Photon couldn't deliver it: {failure.get('code')} {failure.get('message') or ''}".rstrip())
    if final.get("status") != "delivered":
        print(f"   Still '{final.get('status')}' after {DELIVERY_WAIT_SECS}s. Check your phone.")
    return final


def run_echo_bot(poll_secs):
    print(f"🤖 Echo bot ready. Text the agent's number from {_mask(_get_config()['MY_PHONE_NUMBER'])}.")
    print("   Ctrl+C to stop.")
    while True:
        for text in poll_inbound():
            print(f"[{text.received_at:%H:%M:%S}] You: {text.text}")
            try:
                send_text(text.text)
                print("           Bot: (echoed it back)")
            except PhotonError as err:
                print(f"❌ {err}", file=sys.stderr)
        time.sleep(poll_secs)


def run_proactive_test(wait_secs, poll_secs):
    print(f"Step 1/3: text anything to the agent's number from {_mask(_get_config()['MY_PHONE_NUMBER'])}.")
    while True:
        texts = poll_inbound()
        if texts:
            break
        time.sleep(poll_secs)
    print(f"   Got: {texts[-1].text!r}")

    print(f"Step 2/3: don't text again. Sending '?' on our own in {wait_secs}s...")
    deadline = time.monotonic() + wait_secs
    while time.monotonic() < deadline:
        time.sleep(poll_secs)
        if poll_inbound():
            print(f"   You texted again, so that isn't proactive. Restarting the {wait_secs}s timer.")
            deadline = time.monotonic() + wait_secs

    print(f"Step 3/3: sending '?' ({wait_secs}s after your last text)...")
    final = _send_and_report("?")
    if final.get("status") == "delivered":
        print("\n✅ Proactive send works: Photon reports the '?' as delivered.")


def main():
    parser = argparse.ArgumentParser(description="Photon shared iMessage line: echo bot and manual tests.")
    parser.add_argument("--proactive-test", action="store_true", help="wait for your text, then text you on our own")
    parser.add_argument("--wait", type=int, default=60, help="seconds to wait in --proactive-test (default: 60)")
    parser.add_argument("--send", metavar="TEXT", help="send one text in the existing conversation and exit")
    args = parser.parse_args()

    _get_config()
    try:
        if args.send:
            print(f"📤 Sending {args.send!r}...")
            _send_and_report(args.send)
        elif args.proactive_test:
            run_proactive_test(args.wait, POLL_TEXTS_EVERY_SECS)
        else:
            run_echo_bot(POLL_TEXTS_EVERY_SECS)
    except PhotonError as err:
        fail(str(err))
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
