"""Tests for the budget threshold notification service."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from api.services.budget_notifications import check_budget_thresholds


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


async def test_no_notification_when_under_80_percent(mock_pool):
    mock_pool.fetchrow.return_value = {
        "used": 70_000,
        "limit": 100_000,
        "budget_warned_80_at": None,
        "budget_warned_100_at": None,
    }
    with patch("api.services.budget_notifications._send_budget_email") as mock_send:
        await check_budget_thresholds(mock_pool, "user-1", "user@example.com")
    mock_pool.execute.assert_not_called()
    mock_send.assert_not_called()


async def test_inserts_notification_and_sets_flag_at_80_percent(mock_pool):
    mock_pool.fetchrow.return_value = {
        "used": 80_000,
        "limit": 100_000,
        "budget_warned_80_at": None,
        "budget_warned_100_at": None,
    }
    with patch("api.services.budget_notifications._send_budget_email") as mock_send:
        await check_budget_thresholds(mock_pool, "user-1", "user@example.com")
    assert mock_pool.execute.call_count == 2  # insert notification + set flag
    mock_send.assert_called_once_with("user@example.com", 80, 80_000, 100_000)


async def test_inserts_notification_and_sets_flag_at_100_percent(mock_pool):
    mock_pool.fetchrow.return_value = {
        "used": 100_000,
        "limit": 100_000,
        "budget_warned_80_at": datetime.now(UTC),
        "budget_warned_100_at": None,
    }
    with patch("api.services.budget_notifications._send_budget_email") as mock_send:
        await check_budget_thresholds(mock_pool, "user-1", "user@example.com")
    assert mock_pool.execute.call_count == 2
    mock_send.assert_called_once_with("user@example.com", 100, 100_000, 100_000)


async def test_no_duplicate_notification_when_already_warned_this_month(mock_pool):
    now = datetime.now(UTC)
    mock_pool.fetchrow.return_value = {
        "used": 85_000,
        "limit": 100_000,
        "budget_warned_80_at": now,
        "budget_warned_100_at": None,
    }
    with patch("api.services.budget_notifications._send_budget_email") as mock_send:
        await check_budget_thresholds(mock_pool, "user-1", "user@example.com")
    mock_pool.execute.assert_not_called()
    mock_send.assert_not_called()


async def test_no_notification_when_limit_is_zero(mock_pool):
    mock_pool.fetchrow.return_value = {
        "used": 50_000,
        "limit": 0,
        "budget_warned_80_at": None,
        "budget_warned_100_at": None,
    }
    with patch("api.services.budget_notifications._send_budget_email") as mock_send:
        await check_budget_thresholds(mock_pool, "user-1", "user@example.com")
    mock_pool.execute.assert_not_called()
    mock_send.assert_not_called()
