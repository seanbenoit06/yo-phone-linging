"""Create or update the ElevenLabs calendar agent from docs/agents/calendar-agent.md.

Usage:
    python -m mom.calendar.agent          # create (first time) or update the agent
    python -m mom.calendar.agent --show   # print what would be sent, change nothing

Without ELEVENLABS_AGENT_ID_CALENDAR in .env, it duplicates the default agent
(ELEVENLABS_AGENT_ID, keeping its voice and settings) and prints the new ID.
With it, it only replaces that agent's prompt, first message and test values.
"""

import argparse
import json
import re
from datetime import datetime

from mom.calendar.fake import fake_events
from mom.calendar.summary import summarize_events
from mom.config import PROJECT_DIR, fail, load_config, optional_config
from mom.elevenlabs import ApiError, api_request

AGENT_DOC = PROJECT_DIR / "docs" / "agents" / "calendar-agent.md"
AGENT_NAME = "Mom.exe calendar briefing"


def read_agent_doc():
    """(first_message, system_prompt) from the ```text blocks under their headings."""
    text = AGENT_DOC.read_text(encoding="utf-8")

    def block(heading):
        match = re.search(rf"^## {heading}\s*\n+```text\n(.*?)\n```\s*$", text, re.DOTALL | re.MULTILINE)
        if not match:
            fail(f"Couldn't find a ```text block under '## {heading}' in {AGENT_DOC}")
        return match.group(1).strip()

    return block("First message"), block("System prompt")


def agent_patch(user_name):
    first_message, prompt = read_agent_doc()
    # Test values for the dashboard's "Test AI agent" button; real calls send their own.
    now = datetime.now().astimezone()
    placeholders = {"user_name": user_name, **summarize_events(fake_events(now), now)}
    return {
        "name": AGENT_NAME,
        "conversation_config": {
            "agent": {
                "first_message": first_message,
                "prompt": {"prompt": prompt},
                "dynamic_variables": {"dynamic_variable_placeholders": placeholders},
            }
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Create or update the ElevenLabs calendar agent.")
    parser.add_argument("--show", action="store_true", help="print the update instead of sending it")
    args = parser.parse_args()

    config = load_config(["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "USER_NAME"])
    api_key = config["ELEVENLABS_API_KEY"]
    patch = agent_patch(config["USER_NAME"])
    if args.show:
        print(json.dumps(patch, indent=2, ensure_ascii=False))
        return

    agent_id = optional_config("ELEVENLABS_AGENT_ID_CALENDAR")
    created = False
    try:
        if not agent_id:
            source = config["ELEVENLABS_AGENT_ID"]
            print(f"🧬 Duplicating the default agent {source} (voice, LLM, tools) ...")
            response = api_request("POST", f"/v1/convai/agents/{source}/duplicate", api_key, json={"name": AGENT_NAME})
            agent_id = response["agent_id"]
            created = True
        print(f"✏️  Updating {agent_id} from {AGENT_DOC.relative_to(PROJECT_DIR)} ...")
        api_request("PATCH", f"/v1/convai/agents/{agent_id}", api_key, json=patch)
    except ApiError as err:
        fail(str(err))

    print(f"✅ Calendar agent ready: {agent_id}")
    if created:
        print("   Add it to .env so calendar calls use it:")
        print(f"   ELEVENLABS_AGENT_ID_CALENDAR={agent_id}")


if __name__ == "__main__":
    main()
