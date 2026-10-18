"""What is on screen, and does it match the user's goal?

get_activity() reads the frontmost app and window title (the active tab's title and URL
for browsers) with osascript. classify() flags obvious distraction sites by rule and asks
an LLM about everything else (Gemini by default, Jev with DETECTOR_LLM=jev), caching each
answer per title. With DETECTOR_VISION=1, titles the LLM is unsure about get a second look:
a screenshot of the front window goes to Gemini, and is deleted right after.

Manual test: python detector.py "CSE homework" [--vision]   (then switch windows and watch)
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import datetime
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

from common import ENV_FILE
from models import Activity, Focus, Verdict

load_dotenv(ENV_FILE)

OSASCRIPT_TIMEOUT_SECS = 3
CLASSIFY_TIMEOUT_SECS = 4.5  # classify() promises an answer in under 5 seconds

GEMINI_MODEL = "gemini-3.5-flash-lite"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
JEV_MODEL = "typesafe-ai/jev"
JEV_URL = "https://ai-gateway.vercel.sh/v1/decisions"  # Vercel AI Gateway, OpenAI-compatible Decisions API
JEV_MIN_CONFIDENCE = 0.6  # Jev picks below this confidence become UNSURE
LLM_BACKENDS = ("gemini", "jev")

VISION_MIN_SECS = 2.5     # don't start a screenshot check with less time than this left
VISION_REUSE_SECS = 30    # reuse a screenshot verdict for the same window this long
SCREENSHOT_MAX_PX = 1024  # longest side of the image sent to Gemini


# ---------- get_activity ----------

# Process name (to spot browsers) + the name the user sees (web apps' process is "app_mode_loader")
_FRONT_APP = """
tell application "System Events"
    set p to first application process whose frontmost is true
    set processName to name of p
    set shownName to displayed name of p
end tell
if shownName is missing value then set shownName to processName
return processName & linefeed & shownName
"""

_FRONT_WINDOW_TITLE = """
tell application "System Events"
    tell (first application process whose frontmost is true)
        if (count of windows) is 0 then return ""
        set windowTitle to name of front window
    end tell
end tell
if windowTitle is missing value then return ""
return windowTitle
"""

_BROWSER_TAB = """
tell application "{app}"
    if (count of windows) is 0 then return ""
    set t to {tab} of front window
    set tabTitle to {title} of t
    set tabURL to URL of t
end tell
if tabTitle is missing value then set tabTitle to ""
if tabURL is missing value then set tabURL to ""
return tabTitle & linefeed & tabURL
"""

# Each browser's AppleScript words for (the active tab, its title)
BROWSERS = {
    "Google Chrome": ("active tab", "title"),
    "Arc": ("active tab", "title"),
    "Microsoft Edge": ("active tab", "title"),
    "Brave Browser": ("active tab", "title"),
    "Safari": ("current tab", "name"),
}

_UNREAD_COUNT = re.compile(r"^\(\d+\+?\)\s*")  # "(471) YouTube" -> "YouTube", so the cache still hits

_warned = set()


def _warn_once(message):
    if message not in _warned:
        _warned.add(message)
        print(f"⚠️  detector: {message}", file=sys.stderr)


def _osascript(script):
    """Run AppleScript and return its output. Raises RuntimeError with osascript's error text."""
    result = subprocess.run(
        ["osascript", "-"], input=script, capture_output=True, text=True, timeout=OSASCRIPT_TIMEOUT_SECS
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.rstrip("\n")


def _permission_hint(error, target):
    if "assistive access" in error:  # -1719: reading window titles needs Accessibility
        return (
            "macOS blocked reading window titles. Open System Settings → Privacy & Security → "
            "Accessibility, turn on the terminal app running Python, then restart that terminal."
        )
    if "-1743" in error:  # Not authorized to send Apple events
        return (
            f"macOS blocked talking to {target}. Open System Settings → Privacy & Security → "
            f"Automation, find the terminal app running Python, and turn on {target}."
        )
    return f"osascript failed talking to {target}: {error}"


def get_activity():
    """Frontmost app and window title (tab title + URL for browsers). None if macOS blocks us."""
    if sys.platform != "darwin":
        _warn_once("reading the active window only works on macOS so far.")
        return None
    target = "System Events"
    try:
        process, _, app = _osascript(_FRONT_APP).partition("\n")
        if process in BROWSERS:
            target = process
            tab, title = BROWSERS[process]
            output = _osascript(_BROWSER_TAB.format(app=process, tab=tab, title=title))
            tab_title, _, url = output.partition("\n")
            return Activity(app=app or process, title=_UNREAD_COUNT.sub("", tab_title), url=url or None)
        return Activity(app=app or process, title=_UNREAD_COUNT.sub("", _osascript(_FRONT_WINDOW_TITLE)))
    except subprocess.TimeoutExpired:
        _warn_once(f"osascript took over {OSASCRIPT_TIMEOUT_SECS}s talking to {target}. "
                   "If macOS is asking for permission, click OK.")
    except RuntimeError as error:
        _warn_once(_permission_hint(str(error), target))
    return None


# ---------- screenshot (DETECTOR_VISION=1) ----------

_FRONT_WINDOW_BOUNDS = """
tell application "System Events"
    tell (first application process whose frontmost is true)
        set {x, y} to position of front window
        set {w, h} to size of front window
    end tell
end tell
return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
"""


def _screenshot_front_window():
    """JPEG bytes of the front window only, shrunk for upload. Never kept on disk."""
    bounds = _osascript(_FRONT_WINDOW_BOUNDS)
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    try:
        shot = subprocess.run(["screencapture", "-x", "-t", "jpg", "-R", bounds, path],
                              capture_output=True, text=True, timeout=OSASCRIPT_TIMEOUT_SECS)
        if shot.returncode != 0:
            _warn_once("macOS blocked the screenshot. Open System Settings → Privacy & Security → "
                       "Screen & System Audio Recording, turn on the terminal app running Python, "
                       "then restart that terminal.")
            raise RuntimeError("screenshot blocked, needs Screen Recording permission")
        subprocess.run(["sips", "-Z", str(SCREENSHOT_MAX_PX), "-s", "formatOptions", "60", path],
                       capture_output=True, check=True, timeout=OSASCRIPT_TIMEOUT_SECS)
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.remove(path)


# ---------- classify ----------

# Always a distraction, no AI needed: (domain, path prefix, name Mom says out loud)
DISTRACTION_SITES = [
    ("tiktok.com", "", "TikTok"),
    ("instagram.com", "", "Instagram"),
    ("youtube.com", "/shorts", "YouTube Shorts"),
    ("reddit.com", "", "Reddit"),
    ("x.com", "", "Twitter"),
    ("twitter.com", "", "Twitter"),
    ("facebook.com", "", "Facebook"),
    ("netflix.com", "", "Netflix"),
    ("twitch.tv", "", "Twitch"),
]

# Apps that are always a distraction: app name -> name Mom says (same label webcam.py uses)
DISTRACTION_APPS = {
    "iPhone Mirroring": "your phone",
}

# Shared by both LLMs: the Gemini prompt lists these, Jev gets them as choices.
FOCUS_DESCRIPTIONS = {
    Focus.ON_TASK: "Plausibly helps the goal: docs, code editors, terminals, course sites, searching or "
                   "reading about the topic, a tutorial about the topic (even on YouTube), chatting about the work.",
    Focus.DISTRACTED: "Entertainment unrelated to the goal: social feeds, videos or streams not about the goal, "
                      "games, shopping, sports, celebrity news.",
    Focus.UNSURE: "Too little to go on: a new or empty tab, the desktop, a settings window, or a chat app "
                  "(Discord, Slack, Messages) where the conversation isn't clearly about the goal or clearly fun.",
}

# DETECTOR_MODE decides real work that isn't the goal: lockin calls it distracted, relaxed lets it slide.
DETECTOR_MODES = {"lockin": Focus.DISTRACTED, "relaxed": Focus.UNSURE}
_OTHER_WORK = "Also real work on something other than the goal (another project, a job tool, another class)."


def _mode():
    mode = os.getenv("DETECTOR_MODE", "lockin").strip().lower()
    return mode if mode in DETECTOR_MODES else "lockin"


def _focus_descriptions():
    other_work = DETECTOR_MODES[_mode()]
    return {focus: f"{text} {_OTHER_WORK}" if focus is other_work else text
            for focus, text in FOCUS_DESCRIPTIONS.items()}


def _instructions():
    return ("Someone set a goal and is at their computer. From the app and window in front of them, "
            "decide if they are working toward the goal or procrastinating.\n"
            + "\n".join(f"- {focus.value}: {text}" for focus, text in _focus_descriptions().items()))

_GEMINI_SCHEMA = {
    "type": "object",
    "properties": {
        "focus": {"type": "string", "enum": [focus.value for focus in Focus]},
        "distraction": {
            "type": "string",
            "description": "If distracted: short name of the app or website (not what's on it) to say "
                           "out loud, like TikTok, Netflix, Amazon or Discord. Otherwise empty.",
        },
        "reason": {"type": "string", "description": "One short sentence."},
    },
    "required": ["focus", "distraction", "reason"],
}

_cache = {}  # (backend, mode, goal, app, title, page) -> Verdict
_pool = ThreadPoolExecutor(max_workers=4)


def _env_key(name):
    value = os.getenv(name, "").strip()
    if not value or value.startswith("your_"):
        raise RuntimeError(f"{name} is not set in .env")
    return value


def _match_rule(activity):
    if activity.app in DISTRACTION_APPS:
        return Verdict(Focus.DISTRACTED, distraction=DISTRACTION_APPS[activity.app],
                       reason=f"rule: {activity.app} is a distraction")
    url = urlparse(activity.url or "")
    host = (url.hostname or "").lower()
    for domain, path, name in DISTRACTION_SITES:
        if (host == domain or host.endswith("." + domain)) and url.path.startswith(path):
            return Verdict(Focus.DISTRACTED, distraction=name, reason=f"rule: {domain}{path} is a distraction")
    return None


def _short_name(activity):
    """'www.amazon.co.uk' -> 'Amazon'. Falls back to the app name."""
    parts = [p for p in (urlparse(activity.url or "").hostname or "").split(".") if p not in ("www", "m")]
    while len(parts) > 2 and parts[-2] in ("co", "com", "org", "net", "ac"):
        parts.pop()
    return parts[-2].capitalize() if len(parts) >= 2 else activity.app


def _page(activity):
    """Tab URL without ?query or #fragment: they hold IDs and tokens, and would split the cache."""
    if not activity.url:
        return None
    url = urlparse(activity.url)
    return f"{url.hostname}{url.path}" if url.hostname else activity.url.split("?")[0].split("#")[0]


def _describe(activity, goal):
    lines = [f"Goal: {goal}", f"App: {activity.app}", f"Window title: {activity.title or '(none)'}"]
    if activity.url:
        lines.append(f"URL: {_page(activity)[:300]}")
    return "\n".join(lines)


def _post(url, headers, body):
    response = requests.post(url, headers=headers, json=body, timeout=CLASSIFY_TIMEOUT_SECS)
    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code}: {response.text[:200]}")
    return response.json()


def _ask_gemini(activity, goal, image=None):
    instructions = _instructions()
    parts = [{"text": _describe(activity, goal)}]
    if image:
        instructions += "\nA screenshot of the front window is attached. Judge mainly by what it shows."
        parts.append({"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(image).decode()}})
    data = _post(GEMINI_URL, {"x-goog-api-key": _env_key("GEMINI_API_KEY")}, {
        "systemInstruction": {"parts": [{"text": instructions}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": _GEMINI_SCHEMA,
            "thinkingConfig": {"thinkingLevel": "minimal"},
        },
    })
    answer = json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
    focus = Focus(answer["focus"])
    distraction = None
    if focus is Focus.DISTRACTED:
        distraction = answer.get("distraction", "").strip() or _short_name(activity)
    source = "gemini+screenshot" if image else "gemini"
    return Verdict(focus, distraction=distraction, reason=f"{source}: {answer.get('reason', '')}")


def _ask_jev(activity, goal):
    data = _post(JEV_URL, {"Authorization": f"Bearer {_env_key('AI_GATEWAY_API_KEY')}"}, {
        "model": JEV_MODEL,
        "input": _describe(activity, goal),
        "questions": [{
            "type": "choice",
            "name": "focus",
            "instructions": "Is this person working toward their goal or procrastinating?",
            "choices": [{"value": focus.value, "description": text} for focus, text in _focus_descriptions().items()],
        }],
    })
    answer = data["answers"][0]
    if answer.get("type") != "choice":
        return Verdict(Focus.UNSURE, reason=f"jev answered {answer.get('type')}")
    focus = Focus(answer["choice"])
    confidence = answer.get("confidence")
    if confidence is None:
        reason = f"jev: {focus.value}"
    else:
        reason = f"jev: {focus.value} at {confidence:.0%} confidence"
        if confidence < JEV_MIN_CONFIDENCE:
            focus = Focus.UNSURE
    distraction = _short_name(activity) if focus is Focus.DISTRACTED else None
    return Verdict(focus, distraction=distraction, reason=reason)


_ASK = {"gemini": _ask_gemini, "jev": _ask_jev}


def _ask_and_cache(backend, activity, goal, key):
    verdict = _ASK[backend](activity, goal)
    _cache[key] = verdict  # an answer that arrives after the timeout still helps the next check
    return verdict


_screen_cache = {}  # (mode, goal, app, title, page) -> (Verdict, monotonic time it was made)


def _ask_screen_and_cache(activity, goal, key):
    verdict = _ask_gemini(activity, goal, image=_screenshot_front_window())
    _screen_cache[key] = (verdict, time.monotonic())
    return verdict


def _wait(future, deadline):
    return future.result(timeout=max(0.0, deadline - time.monotonic()))


def _look_at_screen(activity, goal, verdict, deadline):
    """Second opinion from a screenshot when the title alone was unclear. Gemini only."""
    key = (_mode(), goal, activity.app, activity.title, _page(activity))
    seen = _screen_cache.get(key)
    if seen and time.monotonic() - seen[1] < VISION_REUSE_SECS:
        return seen[0]
    if deadline - time.monotonic() < VISION_MIN_SECS:
        return verdict
    try:
        return _wait(_pool.submit(_ask_screen_and_cache, activity, goal, key), deadline)
    except FutureTimeout:
        return Verdict(Focus.UNSURE, reason=f"{verdict.reason} | screenshot check took too long")
    except Exception as error:
        return Verdict(Focus.UNSURE, reason=f"{verdict.reason} | screenshot: {error}")


def _classify_with(activity, goal, backend, vision=False):
    deadline = time.monotonic() + CLASSIFY_TIMEOUT_SECS
    try:
        verdict = _match_rule(activity)
        if verdict:
            return verdict
        if backend not in _ASK:
            return Verdict(Focus.UNSURE, reason=f"unknown DETECTOR_LLM {backend!r}, use gemini or jev")
        key = (backend, _mode(), goal, activity.app, activity.title, _page(activity))
        verdict = _cache.get(key) or _wait(_pool.submit(_ask_and_cache, backend, activity, goal, key), deadline)
        if vision and verdict.focus is Focus.UNSURE:
            verdict = _look_at_screen(activity, goal, verdict, deadline)
        return verdict
    except FutureTimeout:
        return Verdict(Focus.UNSURE, reason=f"{backend} took over {CLASSIFY_TIMEOUT_SECS}s")
    except Exception as error:
        return Verdict(Focus.UNSURE, reason=f"{backend} error: {error}")


def classify(activity, goal):
    """ON_TASK / DISTRACTED / UNSURE for this activity. Never raises; answers in under 5 seconds."""
    return _classify_with(activity, goal, os.getenv("DETECTOR_LLM", "gemini").strip().lower(),
                          vision=os.getenv("DETECTOR_VISION", "0").strip() == "1")


# ---------- manual test ----------

def main():
    parser = argparse.ArgumentParser(description="Print what's on screen and whether it matches GOAL.")
    parser.add_argument("goal", help='what you should be doing, e.g. "CSE homework"')
    parser.add_argument("--llm", choices=[*LLM_BACKENDS, "both"],
                        default=os.getenv("DETECTOR_LLM", "gemini").strip().lower(),
                        help="which LLM judges titles the rules can't (default: DETECTOR_LLM or gemini)")
    parser.add_argument("--every", type=float, default=3, help="seconds between checks (default 3)")
    parser.add_argument("--vision", action="store_true", default=os.getenv("DETECTOR_VISION", "0").strip() == "1",
                        help="screenshot the front window when the title is unclear (default: DETECTOR_VISION)")
    parser.add_argument("--mode", choices=list(DETECTOR_MODES), default=_mode(),
                        help="lockin: other real work counts as distracted; relaxed: it doesn't "
                             "(default: DETECTOR_MODE or lockin)")
    args = parser.parse_args()
    os.environ["DETECTOR_MODE"] = args.mode  # classify() reads the mode from the environment
    backends = LLM_BACKENDS if args.llm == "both" else (args.llm,)
    sys.stdout.reconfigure(line_buffering=True)  # show each check right away, even when piped

    print(f"Goal: {args.goal} | mode: {args.mode} | LLM: {', '.join(backends)} | "
          f"screenshots: {'on' if args.vision else 'off'} | checking every {args.every:g}s. Ctrl+C to stop.\n")
    try:
        while True:
            stamp = datetime.now().strftime("%H:%M:%S")
            activity = get_activity()
            if activity is None:
                print(f"[{stamp}] can't read the screen (see the warning above)")
            else:
                url = f" | {activity.url}" if activity.url else ""
                print(f"[{stamp}] {activity.app} | {activity.title}{url}")
                for backend in backends:
                    started = time.monotonic()
                    verdict = _classify_with(activity, args.goal, backend, vision=args.vision)
                    secs = time.monotonic() - started
                    said = f'  → Mom says "{verdict.distraction}"' if verdict.distraction else ""
                    print(f"    {backend:<6} {verdict.focus.value:<10} {secs:4.2f}s  {verdict.reason}{said}")
            time.sleep(args.every)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
