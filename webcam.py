"""Catch the user picking up their phone, using the laptop webcam.

check() takes one photo, asks Perceptron's vision model whether the person is
looking down at a phone in their hand, and returns a models.Verdict.
The photo only lives in memory (ffmpeg pipes it straight to us, nothing is written to disk)
and is dropped when check() returns.

The camera is opened by name, not by index: with Continuity Camera on, macOS also lists the
iPhone as a webcam and the index order isn't stable, so index 0 can turn out to be the phone.

Needs ffmpeg (`brew install ffmpeg`). Run `python webcam.py` to check every 3 seconds and print the result.
"""

import base64
import json
import os
import shutil
import subprocess
import sys
import time

import requests
from dotenv import load_dotenv

from common import ENV_FILE, load_config
from models import Focus, Verdict

API_URL = "https://api.perceptron.inc/v1/chat/completions"
MODEL = "perceptron-mk1.5"
DEFAULT_CAMERA_NAME = "MacBook Pro Camera"  # see `ffmpeg -f avfoundation -list_devices true -i ""`
TIME_BUDGET_SECS = 4.5   # check() must return within 5s; keep some slack
MIN_API_SECS = 1.0       # always leave the API at least this much of the budget
WARMUP_FRAMES = 10       # skip the first frames while auto-exposure settles (~0.3s at 30 fps)
CAPTURE_SIZE = "1280x720"
MAX_IMAGE_WIDTH = 640    # a smaller photo uploads faster and is plenty to spot a phone
TEST_EVERY_SECS = 3

PROMPT = (
    "This is a webcam photo of someone sitting at a laptop. "
    "Are they using a phone right now, meaning a phone is in their hand and they are looking down at it? "
    "A phone lying on the desk does not count. "
    "Answer in JSON. Keep reason under 15 words."
)

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "person_visible": {"type": "boolean"},
        "holding_phone": {"type": "boolean"},
        "looking_at_phone": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["person_visible", "holding_phone", "looking_at_phone", "reason"],
    "additionalProperties": False,
}

load_dotenv(ENV_FILE)


def check() -> Verdict:
    """Photo → Perceptron → Verdict. Never raises; anything that goes wrong is UNSURE."""
    started = time.monotonic()
    try:
        return _check(started)
    except Exception as error:  # a crash here must not take down main.py
        return _unsure(f"{type(error).__name__}: {error}")


def _check(started):
    api_key = os.getenv("PERCEPTRON_API_KEY", "").strip()
    if not api_key or api_key.startswith("your_"):
        return _unsure("PERCEPTRON_API_KEY is missing in .env")

    jpeg = _take_photo(timeout=TIME_BUDGET_SECS - MIN_API_SECS)
    time_left = TIME_BUDGET_SECS - (time.monotonic() - started)
    answer = _ask_perceptron(api_key, jpeg, timeout=time_left)
    reason = f"webcam: {answer['reason']}"

    if not answer["person_visible"]:
        return Verdict(focus=Focus.UNSURE, reason=f"{reason} (no one in frame)")
    if answer["holding_phone"] and answer["looking_at_phone"]:
        return Verdict(focus=Focus.DISTRACTED, distraction="your phone", reason=reason)
    return Verdict(focus=Focus.ON_TASK, reason=reason)


def _take_photo(timeout):
    """Grab one frame from the webcam as JPEG bytes, in memory only."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found. Install it with: brew install ffmpeg")

    camera_name = os.getenv("WEBCAM_NAME", "").strip() or DEFAULT_CAMERA_NAME
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error",
        "-f", "avfoundation", "-framerate", "30", "-video_size", CAPTURE_SIZE,
        "-i", f"{camera_name}:none",  # ":none" = no audio
        "-vf", f"select=gte(n\\,{WARMUP_FRAMES}),scale={MAX_IMAGE_WIDTH}:-2",
        "-frames:v", "1",
        "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4",
        "-",  # write the JPEG to stdout, not to a file
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"webcam didn't give a photo within {timeout:.1f}s")

    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode(errors="replace").strip().splitlines()
        raise RuntimeError(
            f"couldn't read camera '{camera_name}': {detail[-1] if detail else 'no output'}. "
            "Check camera access for your terminal app in System Settings → Privacy & Security → Camera, "
            "and WEBCAM_NAME in .env"
        )
    return result.stdout


def _ask_perceptron(api_key, jpeg, timeout):
    """Send the photo to Perceptron and return the parsed JSON answer (see RESPONSE_SCHEMA)."""
    data_url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode("ascii")
    body = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
        "reasoning_effort": "none",  # thinking would blow the 5s budget
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "phone_check", "strict": True, "schema": RESPONSE_SCHEMA},
        },
        "max_completion_tokens": 200,
    }

    try:
        response = requests.post(
            API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=body,
            timeout=timeout,
        )
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Perceptron didn't answer within {timeout:.1f}s")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("couldn't reach api.perceptron.inc (internet / VPN?)")

    if response.status_code == 401:
        raise RuntimeError("401: Perceptron rejected PERCEPTRON_API_KEY")
    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code}: {_error_message(response)}")

    content = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def _error_message(response):
    try:
        return response.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return response.text[:300] or "(empty response body)"


def _unsure(reason):
    return Verdict(focus=Focus.UNSURE, reason=f"webcam: {reason}")


if __name__ == "__main__":
    load_config(["PERCEPTRON_API_KEY"])  # exits with a clear message if the key is missing
    print(f"Checking the webcam every {TEST_EVERY_SECS}s. Pick up your phone, put it down. Ctrl+C to stop.\n")
    try:
        while True:
            loop_started = time.monotonic()
            verdict = check()
            elapsed = time.monotonic() - loop_started
            print(f"{time.strftime('%H:%M:%S')}  {verdict.focus.value:<10}  {elapsed:4.1f}s  {verdict.reason}")
            if elapsed > 5:
                print("   ⚠️  took longer than 5s", file=sys.stderr)
            time.sleep(max(0.0, TEST_EVERY_SECS - elapsed))
    except KeyboardInterrupt:
        print("\nStopped.")
