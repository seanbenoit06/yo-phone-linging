"""Call the ElevenLabs API with readable errors."""

import requests

API_BASE = "https://api.elevenlabs.io"
DEFAULT_TIMEOUT_SECS = 30


class ApiError(Exception):
    """An ElevenLabs request failed. status_code is None for network errors."""

    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def api_request(method, path, api_key, timeout=DEFAULT_TIMEOUT_SECS, **kwargs):
    """Call ElevenLabs and return the parsed JSON body. Raises ApiError on failure."""
    try:
        response = requests.request(
            method,
            API_BASE + path,
            headers={"xi-api-key": api_key},
            timeout=timeout,
            **kwargs,
        )
    except requests.exceptions.Timeout:
        raise ApiError(None, f"ElevenLabs didn't answer within {timeout}s (timeout).")
    except requests.exceptions.ConnectionError:
        raise ApiError(None, "Couldn't reach api.elevenlabs.io. Check your internet / VPN.")

    if not response.ok:
        raise ApiError(response.status_code, describe_http_error(response))
    try:
        return response.json()
    except ValueError:
        raise ApiError(response.status_code, f"Expected JSON but got: {response.text[:300]}")


def describe_http_error(response):
    status = response.status_code
    detail = _error_detail(response)

    if status == 401:
        return (
            "401 Unauthorized: ElevenLabs rejected your API key.\n"
            "   • Check ELEVENLABS_API_KEY in .env (whole key, no quotes or spaces).\n"
            "   • Make sure the key wasn't deleted or regenerated in the dashboard."
        )
    if status == 403:
        return (
            f"403 Forbidden: {detail}\n"
            "   Your API key works but isn't allowed to use this endpoint.\n"
            "   • ElevenLabs → API Keys → edit the key → enable Agents / Conversational AI access."
        )
    if status == 404:
        return (
            f"404 Not Found: {detail}\n"
            "   • Check the ELEVENLABS_AGENT_ID* and ELEVENLABS_PHONE_NUMBER_ID values in .env.\n"
            "   • Run `python list_numbers.py` to see valid phone_number_id values."
        )
    if status == 422:
        return "422 Validation error. ElevenLabs didn't accept the request:\n" + detail
    if status == 429:
        return f"429 Too Many Requests: {detail}\n   Rate limit or quota hit. Wait a bit and retry."
    if status >= 500:
        return f"{status} ElevenLabs server error: {detail}\n   Probably on their side. Retry in a minute."
    return f"HTTP {status}: {detail}"


def _error_detail(response):
    """Turn ElevenLabs' error body into readable text."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:300] or "(empty response body)"

    detail = body.get("detail", body) if isinstance(body, dict) else body

    # 422 validation errors: a list of {loc, msg, type}
    if isinstance(detail, list):
        lines = []
        for item in detail:
            if isinstance(item, dict):
                where = " → ".join(str(part) for part in item.get("loc", []))
                lines.append(f"   • {where}: {item.get('msg')} ({item.get('type')})")
            else:
                lines.append(f"   • {item}")
        return "\n".join(lines)

    # Other errors: usually {"status": "...", "message": "..."}
    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("status")
        return message or str(detail)
    return str(detail)
