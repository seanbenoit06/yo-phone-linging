"""Shared fixtures for calendar tests. Never use the real clock or the network in tests."""

from datetime import datetime, timedelta, timezone

import pytest

from mom.calendar.fake import fake_events

# Seattle in October (PDT). A fixed offset, so tests don't depend on the machine's timezone.
PACIFIC = timezone(timedelta(hours=-7), "PDT")


@pytest.fixture
def tz():
    return PACIFIC


@pytest.fixture
def now():
    """Saturday October 17 2026, 10:05 AM, timezone-aware."""
    return datetime(2026, 10, 17, 10, 5, tzinfo=PACIFIC)


@pytest.fixture
def events(now):
    """fake_events(now): done, in-progress, upcoming, all-day and overlapping events."""
    return fake_events(now)
