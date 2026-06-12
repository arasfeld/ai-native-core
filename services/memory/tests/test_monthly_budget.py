"""Tests for TenantMonthlyBudget."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from memory.budget import BudgetExceeded, TenantMonthlyBudget
from memory.session import SessionStore


@pytest.fixture
def mock_store():
    store = MagicMock(spec=SessionStore)
    store.get_monthly_tenant_usage = AsyncMock(return_value=0)
    store.get_monthly_tenant_cost = AsyncMock(return_value=Decimal("0"))
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
    assert exc_info.value.mode == "tokens"


@pytest.mark.asyncio
async def test_monthly_budget_remaining(mock_store):
    mock_store.get_monthly_tenant_usage.return_value = 30_000
    budget = TenantMonthlyBudget(mock_store, limit=100_000)
    assert await budget.remaining("tenant-123") == 70_000


@pytest.mark.asyncio
async def test_cost_budget_ok(mock_store):
    mock_store.get_monthly_tenant_cost.return_value = Decimal("12.34")
    budget = TenantMonthlyBudget(mock_store, cost_limit_usd=Decimal("25.00"))
    assert budget.mode == "cost"
    await budget.check("tenant-123")
    mock_store.get_monthly_tenant_usage.assert_not_called()


@pytest.mark.asyncio
async def test_cost_budget_exceeded(mock_store):
    mock_store.get_monthly_tenant_cost.return_value = Decimal("25.00")
    budget = TenantMonthlyBudget(mock_store, cost_limit_usd=Decimal("25.00"))
    with pytest.raises(BudgetExceeded) as exc_info:
        await budget.check("tenant-123")
    assert exc_info.value.mode == "cost"
    assert exc_info.value.used == Decimal("25.00")
    assert exc_info.value.limit == Decimal("25.00")


@pytest.mark.asyncio
async def test_cost_budget_remaining(mock_store):
    mock_store.get_monthly_tenant_cost.return_value = Decimal("7.50")
    budget = TenantMonthlyBudget(mock_store, cost_limit_usd=Decimal("10.00"))
    assert await budget.remaining("tenant-123") == Decimal("2.50")
