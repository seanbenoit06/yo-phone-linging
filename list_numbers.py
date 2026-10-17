"""List the phone numbers imported into ElevenLabs, so you can copy the right
phone_number_id into ELEVENLABS_PHONE_NUMBER_ID in .env.

Usage: python list_numbers.py
"""

from mom.config import fail, load_config
from mom.elevenlabs import ApiError, api_request


def main():
    config = load_config(["ELEVENLABS_API_KEY"])

    try:
        numbers = api_request("GET", "/v1/convai/phone-numbers", config["ELEVENLABS_API_KEY"])
    except ApiError as err:
        fail(str(err))

    if not numbers:
        print("No phone numbers found in this ElevenLabs account.")
        print("Import your Photon number: Phone Numbers → Import number → From SIP Trunk.")
        return

    print(f"Found {len(numbers)} phone number(s):\n")
    for number in numbers:
        agent = number.get("assigned_agent") or {}
        print(f"• {number.get('label')}  {number.get('phone_number')}  [{number.get('provider')}]")
        print(f"    phone_number_id : {number.get('phone_number_id')}")
        if agent:
            print(f"    assigned agent  : {agent.get('agent_name')} ({agent.get('agent_id')})")
        else:
            print("    assigned agent  : (none)")

        if number.get("provider") == "sip_trunk":
            outbound = number.get("outbound_trunk") or {}
            if outbound.get("address"):
                credentials = "yes" if outbound.get("has_auth_credentials") else "NO"
                print(
                    f"    outbound trunk  : {outbound.get('address')} "
                    f"(transport={outbound.get('transport')}, credentials={credentials})"
                )
            else:
                print("    outbound trunk  : NOT CONFIGURED (outbound calls will fail)")
        print()

    print("👉 Copy the phone_number_id of your Photon number into ELEVENLABS_PHONE_NUMBER_ID in .env")


if __name__ == "__main__":
    main()
