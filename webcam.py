"""Catch the user on their phone, using the laptop webcam.

check() takes one photo, asks Gemini whether the person is on their phone, and returns a models.Verdict.
snapshot() only takes a photo (the dashboard's camera preview, no Gemini). Photos only live in memory:
ffmpeg pipes them straight to us and nothing is written to disk. The latest one is kept for the
dashboard (latest_photo()) until the next photo replaces it or forget_photo() drops it.

Gemini won a benchmark against YOLO26, MediaPipe gaze tracking, Jev 1.14, OpenAI luna-decisions and
Perceptron Mk1.5: it caught 6/6 phones held in frame with 0/9 false alarms. A phone held out of frame
(in the lap) is not reliably caught by any of them, so in the demo hold the phone at chest height.

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
import threading
import time
from datetime import datetime

import requests
from dotenv import load_dotenv

from common import ENV_FILE, load_config
from models import Focus, Verdict

GEMINI_MODEL = "gemini-3.5-flash-lite"  # same model and key (GEMINI_API_KEY) as detector.py
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
DEFAULT_CAMERA_NAME = "MacBook Pro Camera"  # see `ffmpeg -f avfoundation -list_devices true -i ""`
TIME_BUDGET_SECS = 4.5   # check() must return within 5s; keep some slack
MIN_API_SECS = 1.0       # always leave the API at least this much of the budget
WARMUP_FRAMES = 10       # skip the first frames while auto-exposure settles (~0.3s at 30 fps)
CAPTURE_SIZE = "1280x720"
MAX_IMAGE_WIDTH = 640    # a smaller photo uploads faster and is plenty to spot a phone
TEST_EVERY_SECS = 3

PROMPT = (
    "This is a webcam photo of someone sitting at a laptop. Are they on their phone right now? "
    "Yes if a phone is in their hand and they look at it, OR if their head is tilted down and their eyes look "
    "down past the laptop toward their hands or lap, the way people look when scrolling a phone held out of view. "
    "No if they look at the laptop screen or the camera, or look down at the keyboard while typing, "
    "or if a phone just lies on the desk. "
    "Answer in JSON. Keep reason under 15 words."
)

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "person_visible": {"type": "boolean"},
        "phone_in_hand": {"type": "boolean"},
        "on_phone": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["person_visible", "phone_in_hand", "on_phone", "reason"],
    "additionalProperties": False,
}

load_dotenv(ENV_FILE)

_photo_lock = threading.Lock()
_last_photo = None   # (jpeg bytes, captured_at): memory only, for the dashboard preview
_last_error = None   # why the last snapshot() failed, for the dashboard


def latest_photo():
    """(jpeg bytes, timezone-aware captured_at) of the latest photo, or None."""
    with _photo_lock:
        return _last_photo


def forget_photo():
    global _last_photo
    with _photo_lock:
        _last_photo = None


def snapshot():
    """Take a photo without asking Gemini (no cost). Returns the JPEG bytes, or None; never raises."""
    global _last_error
    try:
        jpeg = _take_photo(timeout=TIME_BUDGET_SECS)
    except Exception as error:  # noqa: BLE001
        _last_error = f"{type(error).__name__}: {error}"
        return None
    _last_error = None
    return jpeg


def last_error():
    """Why the last snapshot() returned None, or None if it worked."""
    return _last_error


def _remember_photo(jpeg):
    global _last_photo
    with _photo_lock:
        _last_photo = (jpeg, datetime.now().astimezone())


def check() -> Verdict:
    """Photo → Gemini → Verdict. Never raises; anything that goes wrong is UNSURE."""
    started = time.monotonic()
    try:
        return _check(started)
    except Exception as error:  # a crash here must not take down main.py
        return _unsure(f"{type(error).__name__}: {error}")


def _check(started):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key.startswith("your_"):
        return _unsure("GEMINI_API_KEY is missing in .env")

    jpeg = _take_photo(timeout=TIME_BUDGET_SECS - MIN_API_SECS)
    time_left = TIME_BUDGET_SECS - (time.monotonic() - started)
    answer = _ask_gemini(api_key, jpeg, timeout=time_left)
    reason = f"webcam: {answer['reason']}"

    if not answer["person_visible"]:
        return Verdict(focus=Focus.UNSURE, reason=f"{reason} (no one in frame)")
    if answer["on_phone"]:
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
    _remember_photo(result.stdout)
    return result.stdout


def _ask_gemini(api_key, jpeg, timeout):
    """Send the photo to Gemini and return the parsed JSON answer (see RESPONSE_SCHEMA)."""
    body = {
        "contents": [{"role": "user", "parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(jpeg).decode("ascii")}},
            {"text": PROMPT},
        ]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": RESPONSE_SCHEMA,
            "thinkingConfig": {"thinkingLevel": "minimal"},  # more thinking would blow the 5s budget
        },
    }

    try:
        response = requests.post(GEMINI_URL, headers={"x-goog-api-key": api_key}, json=body, timeout=timeout)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Gemini didn't answer within {timeout:.1f}s")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("couldn't reach generativelanguage.googleapis.com (internet / VPN?)")

    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code}: {_error_message(response)}")

    data = response.json()
    if not data.get("candidates"):
        raise RuntimeError(f"Gemini gave no answer: {data.get('promptFeedback', data)}")
    parts = data["candidates"][0]["content"]["parts"]
    return json.loads([part for part in parts if "text" in part][-1]["text"])


def _error_message(response):
    try:
        return response.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return response.text[:300] or "(empty response body)"


def _unsure(reason):
    return Verdict(focus=Focus.UNSURE, reason=f"webcam: {reason}")


if __name__ == "__main__":
    load_config(["GEMINI_API_KEY"])  # exits with a clear message if the key is missing
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
