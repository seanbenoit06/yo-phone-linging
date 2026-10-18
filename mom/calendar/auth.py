"""Google OAuth for the calendar feature: an authorized requests session, read-only.

The first run opens your browser to approve access and saves token.json next to
credentials.json in the project root. Both files are git-ignored.
"""

from mom.config import PROJECT_DIR

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
CREDENTIALS_FILE = PROJECT_DIR / "credentials.json"
TOKEN_FILE = PROJECT_DIR / "token.json"

SETUP_STEPS = """   One-time Google setup (https://console.cloud.google.com):
   1. Create a project, then enable the Google Calendar API for it.
   2. Google Auth Platform → Branding: fill in an app name and your email (Audience: External).
      Audience → Test users → add the Google account whose calendar Mom should read.
   3. Clients → Create client → Desktop app → download the JSON.
   4. Save it as credentials.json in the project root:
      {path}"""


class AuthError(Exception):
    """Google authorization failed. The message is ready to show the user."""


def get_session():
    """Return a google.auth AuthorizedSession (a requests.Session) for the Calendar API.

    Uses token.json if it's still good, refreshes it if it expired, and otherwise
    runs the browser consent flow. Raises AuthError with setup steps on failure.
    """
    # Imported here so the rest of the app runs without the Google packages installed.
    from google.auth.exceptions import RefreshError, TransportError
    from google.auth.transport.requests import AuthorizedSession, Request
    from google.oauth2.credentials import Credentials

    credentials = None
    if TOKEN_FILE.exists():
        try:
            credentials = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except ValueError:
            print("⚠️  token.json is unreadable, so Google will ask you to sign in again.")

    if credentials and not credentials.valid and credentials.refresh_token:
        try:
            credentials.refresh(Request())
            _save_token(credentials)
        except RefreshError:
            # Apps in "Testing" get refresh tokens that expire after 7 days, so this is expected.
            print("⚠️  Your Google sign-in expired (normal every 7 days for apps in Testing). Signing in again.")
            TOKEN_FILE.unlink(missing_ok=True)
            credentials = None
        except TransportError as err:
            raise AuthError(f"Couldn't reach Google to refresh your sign-in: {err}\n   Check your internet / VPN.")

    if not credentials or not credentials.valid:
        credentials = _authorize()
    return AuthorizedSession(credentials)


def _authorize():
    """Run the browser consent flow and save token.json."""
    from google_auth_oauthlib.flow import InstalledAppFlow

    if not CREDENTIALS_FILE.exists():
        raise AuthError(
            "credentials.json not found, so Mom can't sign in to Google Calendar.\n"
            + SETUP_STEPS.format(path=CREDENTIALS_FILE)
        )
    try:
        flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
    except ValueError as err:
        raise AuthError(
            f"credentials.json isn't a valid OAuth client file: {err}\n"
            "   Download it again from Google Auth Platform → Clients, and pick type Desktop app."
        )

    print("🌐 Opening your browser to sign in to Google (read-only calendar access)...")
    try:
        credentials = flow.run_local_server(port=0, open_browser=True)
    except Exception as err:  # oauthlib raises a zoo of errors (access_denied, mismatched state, ...)
        raise AuthError(
            f"Google sign-in didn't complete: {err}\n"
            "   • Sign in with an account listed under Google Auth Platform → Audience → Test users.\n"
            "   • Tick the calendar permission on the consent screen, then try again."
        )
    _save_token(credentials)
    print(f"✅ Signed in to Google. Saved {TOKEN_FILE.name}.")
    return credentials


def _save_token(credentials):
    TOKEN_FILE.write_text(credentials.to_json(), encoding="utf-8")
