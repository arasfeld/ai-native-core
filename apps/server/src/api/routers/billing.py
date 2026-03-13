"""Billing routes — Stripe checkout, customer portal, webhooks, and usage."""

from __future__ import annotations

import stripe
import structlog
from fastapi import APIRouter, HTTPException, Request
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
    tokens_used_this_month: int
    tokens_remaining: int


class CheckoutResponse(BaseModel):
    url: str


class PortalResponse(BaseModel):
    url: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_tenant(pool, tenant_id: str) -> dict:
    row = await pool.fetchrow(
        "SELECT id, name, plan, token_limit, stripe_customer_id, stripe_subscription_id FROM tenants WHERE id = $1",
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
    limit = tenant["token_limit"]
    return PlanInfo(
        plan=tenant["plan"],
        token_limit=limit,
        tokens_used_this_month=used,
        tokens_remaining=max(0, limit - used) if limit > 0 else -1,
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
