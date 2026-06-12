"""Billing routes — Stripe checkout, customer portal, webhooks, and usage."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import stripe
import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from ..auth import CurrentUser
from ..config import settings

log = structlog.get_logger()
router = APIRouter(prefix="/billing", tags=["billing"])

PLAN_TOKEN_LIMITS: dict[str, int] = {
    "free": 100_000,
    "pro": 2_000_000,
}


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PlanInfo(BaseModel):
    plan: str
    token_limit: int
    referral_bonus_tokens: int
    tokens_used_this_month: int
    tokens_remaining: int
    # When the tenant is cost-capped (``cost_limit_usd`` set), these surface
    # the dollar budget alongside the existing token counters so the UI can
    # render either view. Always populated with the month-to-date cost; the
    # limit/remaining fields are None for tenants without a cost cap.
    cost_used_this_month_usd: Decimal
    cost_limit_usd: Decimal | None = None
    cost_remaining_usd: Decimal | None = None


class CheckoutResponse(BaseModel):
    url: str


class PortalResponse(BaseModel):
    url: str


class Invoice(BaseModel):
    id: str
    number: str | None
    amount_due: int
    amount_paid: int
    currency: str
    status: str | None
    created: int
    period_start: int
    period_end: int
    hosted_invoice_url: str | None
    invoice_pdf: str | None


class InvoiceList(BaseModel):
    invoices: list[Invoice]
    has_more: bool


class DayTokens(BaseModel):
    day: date
    tokens: int


class UsageSummary(BaseModel):
    days: int
    total_tokens: int
    tokens_per_day: list[DayTokens]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_tenant(pool, tenant_id: str) -> dict:
    row = await pool.fetchrow(
        "SELECT id, name, plan, token_limit, "
        "       COALESCE(referral_bonus_tokens, 0) AS referral_bonus_tokens, "
        "       cost_limit_usd, "
        "       stripe_customer_id, stripe_subscription_id "
        "FROM tenants WHERE id = $1",
        tenant_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return dict(row)


async def _get_monthly_usage(pool, tenant_id: str) -> int:
    """Return total tokens consumed by this tenant in the current calendar month."""
    row = await pool.fetchrow(
        """
        SELECT COALESCE(SUM(tokens), 0) AS total
        FROM session_token_usage
        WHERE tenant_id = $1
          AND recorded_at >= date_trunc('month', NOW())
        """,
        tenant_id,
    )
    return int(row["total"])


async def _get_monthly_cost(pool, tenant_id: str) -> Decimal:
    """Return total USD spent by this tenant in the current calendar month."""
    row = await pool.fetchrow(
        """
        SELECT COALESCE(SUM(cost_usd), 0) AS total
        FROM session_token_usage
        WHERE tenant_id = $1
          AND recorded_at >= date_trunc('month', NOW())
        """,
        tenant_id,
    )
    return Decimal(row["total"])


async def _ensure_stripe_customer(pool, tenant: dict) -> str:
    """Return the Stripe customer ID, creating one if needed."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    stripe.api_key = settings.stripe_secret_key

    if tenant["stripe_customer_id"]:
        return tenant["stripe_customer_id"]

    customer = stripe.Customer.create(name=tenant["name"])
    await pool.execute(
        "UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2",
        customer.id,
        tenant["id"],
    )
    return customer.id


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/plan", response_model=PlanInfo)
async def get_plan(request: Request, current_user: CurrentUser) -> PlanInfo:
    """Return the current plan and token usage for this month."""
    pool = request.app.state.db_pool
    tenant = await _get_tenant(pool, current_user.id)
    used = await _get_monthly_usage(pool, current_user.id)
    cost_used = await _get_monthly_cost(pool, current_user.id)
    bonus = int(tenant["referral_bonus_tokens"])
    total_limit = int(tenant["token_limit"]) + bonus
    cost_limit_raw = tenant.get("cost_limit_usd")
    cost_limit = Decimal(cost_limit_raw) if cost_limit_raw is not None else None
    cost_remaining = max(Decimal("0"), cost_limit - cost_used) if cost_limit is not None else None
    return PlanInfo(
        plan=tenant["plan"],
        token_limit=total_limit,
        referral_bonus_tokens=bonus,
        tokens_used_this_month=used,
        tokens_remaining=max(0, total_limit - used) if total_limit > 0 else -1,
        cost_used_this_month_usd=cost_used,
        cost_limit_usd=cost_limit,
        cost_remaining_usd=cost_remaining,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(request: Request, current_user: CurrentUser) -> CheckoutResponse:
    """Create a Stripe Checkout session to upgrade to the Pro plan."""
    if not settings.stripe_pro_price_id:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    stripe.api_key = settings.stripe_secret_key
    pool = request.app.state.db_pool
    tenant = await _get_tenant(pool, current_user.id)
    customer_id = await _ensure_stripe_customer(pool, tenant)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": settings.stripe_pro_price_id, "quantity": 1}],
        success_url=f"{settings.web_url}/billing?upgraded=1",
        cancel_url=f"{settings.web_url}/billing",
    )
    log.info("billing.checkout.created", tenant_id=current_user.id, session_id=session.id)
    return CheckoutResponse(url=session.url)


@router.get("/invoices", response_model=InvoiceList)
async def list_invoices(
    request: Request,
    current_user: CurrentUser,
    limit: int = 20,
    starting_after: str | None = None,
) -> InvoiceList:
    """List past Stripe invoices for the current tenant, most recent first."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    stripe.api_key = settings.stripe_secret_key
    pool = request.app.state.db_pool
    tenant = await _get_tenant(pool, current_user.id)

    if not tenant["stripe_customer_id"]:
        return InvoiceList(invoices=[], has_more=False)

    params: dict = {
        "customer": tenant["stripe_customer_id"],
        "limit": max(1, min(limit, 100)),
    }
    if starting_after:
        params["starting_after"] = starting_after

    page = stripe.Invoice.list(**params)
    return InvoiceList(
        invoices=[
            Invoice(
                id=inv["id"],
                number=inv.get("number"),
                amount_due=inv.get("amount_due", 0),
                amount_paid=inv.get("amount_paid", 0),
                currency=inv.get("currency", "usd"),
                status=inv.get("status"),
                created=inv["created"],
                period_start=inv.get("period_start", inv["created"]),
                period_end=inv.get("period_end", inv["created"]),
                hosted_invoice_url=inv.get("hosted_invoice_url"),
                invoice_pdf=inv.get("invoice_pdf"),
            )
            for inv in page.data
        ],
        has_more=bool(page.has_more),
    )


@router.get("/usage", response_model=UsageSummary)
async def get_usage(
    request: Request,
    current_user: CurrentUser,
    days: int = Query(30, ge=7, le=180, description="Look-back window in days"),
) -> UsageSummary:
    """Return daily token usage for the current tenant over the look-back window.

    Guest users (with a ``guest:`` prefix) don't have a tenant row, so we treat
    them as having zero usage history — the response is well-formed with
    zero-filled rows the frontend can still render.
    """
    pool = request.app.state.db_pool

    rows = await pool.fetch(
        """
        SELECT recorded_at::date AS day, COALESCE(SUM(tokens), 0)::int AS tokens
        FROM session_token_usage
        WHERE tenant_id = $1
          AND recorded_at >= (CURRENT_DATE - ($2::int - 1))
        GROUP BY day
        ORDER BY day
        """,
        current_user.id,
        days,
    )

    tokens_per_day = [DayTokens(day=row["day"], tokens=row["tokens"]) for row in rows]
    total = sum(row["tokens"] for row in rows)
    return UsageSummary(days=days, total_tokens=total, tokens_per_day=tokens_per_day)


@router.post("/portal", response_model=PortalResponse)
async def create_portal(request: Request, current_user: CurrentUser) -> PortalResponse:
    """Create a Stripe Customer Portal session to manage the subscription."""
    stripe.api_key = settings.stripe_secret_key
    pool = request.app.state.db_pool
    tenant = await _get_tenant(pool, current_user.id)
    customer_id = await _ensure_stripe_customer(pool, tenant)

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.web_url}/billing",
    )
    log.info("billing.portal.created", tenant_id=current_user.id)
    return PortalResponse(url=session.url)


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request) -> dict:
    """Handle Stripe webhook events to keep plan state in sync."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")

    stripe.api_key = settings.stripe_secret_key
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except stripe.error.SignatureVerificationError as err:
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from err

    pool = request.app.state.db_pool

    if event["type"] in ("customer.subscription.created", "customer.subscription.updated"):
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        active = sub["status"] in ("active", "trialing")
        plan = "pro" if active else "free"
        token_limit = PLAN_TOKEN_LIMITS[plan]

        await pool.execute(
            """
            UPDATE tenants
            SET plan = $1, token_limit = $2, stripe_subscription_id = $3
            WHERE stripe_customer_id = $4
            """,
            plan,
            token_limit,
            sub["id"],
            customer_id,
        )
        log.info("billing.webhook.subscription_updated", plan=plan, customer=customer_id)

    elif event["type"] == "customer.subscription.deleted":
        customer_id = event["data"]["object"]["customer"]
        await pool.execute(
            """
            UPDATE tenants
            SET plan = 'free', token_limit = $1, stripe_subscription_id = NULL
            WHERE stripe_customer_id = $2
            """,
            PLAN_TOKEN_LIMITS["free"],
            customer_id,
        )
        log.info("billing.webhook.subscription_cancelled", customer=customer_id)

    return {"received": True}
