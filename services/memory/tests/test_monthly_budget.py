"""Tests for TenantMonthlyBudget."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from memory.session import SessionStore
from memory.budget import TenantMonthlyBudget, BudgetExceeded


@pytest.fixture
def mock_store():
    store = MagicMock(spec=SessionStore)
    store.get_monthly_tenant_usage = AsyncMock(return_value=0)
    store.add_token_usage = AsyncMock()
    return store


@pytest.mark.asyncio
async def test_monthly_budget_ok(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 50_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    await budget.check("tenant-123")


@pytest.mark.asyncio
async def test_monthly_budget_exceeded(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 100_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    with pytest.raises(BudgetExceeded) as exc_info:
        await budget.check("tenant-123")
    assert exc_info.value.used == 100_000
    assert exc_info.value.limit == 100_000


@pytest.mark.asyncio
async def test_monthly_budget_remaining(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 30_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    assert await budget.remaining("tenant-123") == 70_000
