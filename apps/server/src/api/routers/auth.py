"""Auth routes — user info, profile management, session management, account deletion."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import CurrentUser
from ..services.audit import get_client_ip, log_audit_event

log = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Models ────────────────────────────────────────────────────────────────────


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None = None
    image: str | None = None
    emailVerified: bool = False  # noqa: N815


class ProfileUpdate(BaseModel):
    name: str | None = None
    image: str | None = None


class SessionOut(BaseModel):
    id: str
    token: str
    ipAddress: str | None = None  # noqa: N815
    userAgent: str | None = None  # noqa: N815
    createdAt: str  # noqa: N815
    expiresAt: str  # noqa: N815


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    """Return the currently authenticated user (lightweight, no extra DB query)."""
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        image=current_user.image,
        emailVerified=current_user.email_verified,
    )


@router.get("/profile", response_model=UserOut)
async def get_profile(request: Request, current_user: CurrentUser) -> UserOut:
    """Return the current user's full profile."""
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        'SELECT id, email, name, image, "emailVerified" FROM "user" WHERE id = $1',
        current_user.id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        emailVerified=row["emailVerified"],
    )


@router.put("/profile", response_model=UserOut)
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    current_user: CurrentUser,
) -> UserOut:
    """Update the current user's name and/or image."""
    pool = request.app.state.db_pool

    fields: list[str] = []
    values: list[str | None] = []
    idx = 1

    if body.name is not None:
        fields.append(f'"name" = ${idx}')
        values.append(body.name)
        idx += 1
    if body.image is not None:
        fields.append(f'"image" = ${idx}')
        values.append(body.image)
        idx += 1

    if fields:
        values.append(current_user.id)
        await pool.execute(
            f'UPDATE "user" SET {", ".join(fields)}, "updatedAt" = NOW() WHERE id = ${idx}',
            *values,
        )

    row = await pool.fetchrow(
        'SELECT id, email, name, image, "emailVerified" FROM "user" WHERE id = $1',
        current_user.id,
    )
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        emailVerified=row["emailVerified"],
    )


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(request: Request, current_user: CurrentUser) -> list[SessionOut]:
    """List all active sessions for the current user."""
    pool = request.app.state.db_pool
    rows = await pool.fetch(
        """
        SELECT id, token, "ipAddress", "userAgent",
               "createdAt"::text, "expiresAt"::text
        FROM "session"
        WHERE "userId" = $1 AND "expiresAt" > NOW()
        ORDER BY "createdAt" DESC
        """,
        current_user.id,
    )
    return [
        SessionOut(
            id=row["id"],
            token=row["token"],
            ipAddress=row["ipAddress"],
            userAgent=row["userAgent"],
            createdAt=row["createdAt"],
            expiresAt=row["expiresAt"],
        )
        for row in rows
    ]


@router.delete("/sessions/{token}", status_code=204)
async def revoke_session(
    token: str,
    request: Request,
    current_user: CurrentUser,
) -> Response:
    """Revoke a specific session by its token (only sessions owned by the current user)."""
    pool = request.app.state.db_pool
    await pool.execute(
        'DELETE FROM "session" WHERE token = $1 AND "userId" = $2',
        token,
        current_user.id,
    )
    return Response(status_code=204)


@router.delete("/account", status_code=204)
async def delete_account(request: Request, current_user: CurrentUser) -> Response:
    """Permanently delete the current user's account, cancelling any Stripe subscription first."""
    pool = request.app.state.db_pool

    tenant = await pool.fetchrow(
        "SELECT stripe_subscription_id FROM tenants WHERE id = $1",
        current_user.id,
    )
    if tenant and tenant["stripe_subscription_id"]:
        try:
            import stripe  # type: ignore[import-untyped]

            from ..config import settings

            stripe.api_key = settings.stripe_secret_key
            stripe.Subscription.cancel(tenant["stripe_subscription_id"])
            log.info("billing.subscription.cancelled_on_account_delete", user_id=current_user.id)
        except Exception as exc:
            log.warning(
                "billing.subscription.cancel_failed",
                user_id=current_user.id,
                error=str(exc),
            )

    log_audit_event(
        pool, current_user.id, "account.deleted", "user", current_user.id,
        ip_address=get_client_ip(request),
    )
    await pool.execute("DELETE FROM tenants WHERE id = $1", current_user.id)
    await pool.execute('DELETE FROM "user" WHERE id = $1', current_user.id)

    log.info("auth.account.deleted", user_id=current_user.id)
    return Response(status_code=204)


class BootstrapTenantRequest(BaseModel):
    user_id: str
    email: str


@router.post("/bootstrap-tenant", status_code=204)
async def bootstrap_tenant(body: BootstrapTenantRequest, request: Request) -> Response:
    """Called by better-auth signup hook to eagerly create personal org (no auth required)."""
    import re

    pool = request.app.state.db_pool
    slug_base = re.sub(r"[^a-z0-9]+", "-", body.email.split("@")[0].lower()).strip("-")
    slug = f"{slug_base}-{body.user_id[:4]}"
    await pool.execute(
        """
        INSERT INTO tenants (id, name, plan, token_limit, slug)
        VALUES ($1, $2, 'free', 100000, $3)
        ON CONFLICT (id) DO NOTHING
        """,
        body.user_id,
        body.email,
        slug,
    )
    await pool.execute(
        """
        INSERT INTO organization_members (org_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (org_id, user_id) DO NOTHING
        """,
        body.user_id,
        body.user_id,
    )
    return Response(status_code=204)
