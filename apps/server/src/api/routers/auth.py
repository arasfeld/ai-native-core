"""Auth routes — user info, profile management, session management, account deletion."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

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


class OnboardingStatus(BaseModel):
    completedAt: str | None = None  # noqa: N815


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


@router.get("/onboarding", response_model=OnboardingStatus)
async def get_onboarding_status(request: Request, current_user: CurrentUser) -> OnboardingStatus:
    """Return whether the current user has completed onboarding."""
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        'SELECT "onboardingCompletedAt"::text FROM "user" WHERE id = $1',
        current_user.id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return OnboardingStatus(completedAt=row["onboardingCompletedAt"])


@router.post("/onboarding/complete", response_model=OnboardingStatus)
async def complete_onboarding(request: Request, current_user: CurrentUser) -> OnboardingStatus:
    """Mark onboarding as complete for the current user (idempotent)."""
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        """
        UPDATE "user"
        SET "onboardingCompletedAt" = COALESCE("onboardingCompletedAt", NOW()),
            "updatedAt" = NOW()
        WHERE id = $1
        RETURNING "onboardingCompletedAt"::text
        """,
        current_user.id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    log.info("auth.onboarding.completed", user_id=current_user.id)
    return OnboardingStatus(completedAt=row["onboardingCompletedAt"])


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


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


@router.get("/export")
async def export_user_data(request: Request, current_user: CurrentUser) -> Response:
    """Return all personal data associated with the current user as a JSON download (GDPR Article 20)."""
    pool = request.app.state.db_pool
    user_id = current_user.id
    session_prefix = f"{user_id}:%"

    profile_row = await pool.fetchrow(
        'SELECT id, email, name, image, "emailVerified", "createdAt", "updatedAt" '
        'FROM "user" WHERE id = $1',
        user_id,
    )
    if not profile_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    tenant_row = await pool.fetchrow(
        "SELECT id, name, slug, plan, token_limit, created_at FROM tenants WHERE id = $1",
        user_id,
    )
    preferences_row = await pool.fetchrow(
        "SELECT system_instructions, updated_at FROM user_preferences WHERE user_id = $1",
        user_id,
    )
    session_rows = await pool.fetch(
        'SELECT id, "ipAddress", "userAgent", "createdAt", "expiresAt" '
        'FROM "session" WHERE "userId" = $1 ORDER BY "createdAt" DESC',
        user_id,
    )
    conversation_rows = await pool.fetch(
        "SELECT id, title, system_instructions, created_at, updated_at "
        "FROM conversations WHERE user_id = $1 ORDER BY created_at",
        user_id,
    )
    message_rows = await pool.fetch(
        "SELECT session_id, role, content, created_at FROM chat_sessions "
        "WHERE session_id LIKE $1 ORDER BY session_id, created_at",
        session_prefix,
    )
    token_usage_rows = await pool.fetch(
        "SELECT session_id, tokens, recorded_at FROM session_token_usage "
        "WHERE tenant_id = $1 OR session_id LIKE $2 ORDER BY recorded_at",
        user_id,
        session_prefix,
    )
    notification_rows = await pool.fetch(
        "SELECT id, type, title, body, read_at, created_at "
        "FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    audit_rows = await pool.fetch(
        "SELECT id, action, resource_type, resource_id, metadata, ip_address, created_at "
        "FROM audit_logs WHERE actor_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    api_key_rows = await pool.fetch(
        "SELECT id, name, key_prefix, created_at, last_used_at, revoked_at "
        "FROM user_api_keys WHERE user_id = $1 ORDER BY created_at",
        user_id,
    )
    org_member_rows = await pool.fetch(
        "SELECT org_id, role, joined_at FROM organization_members WHERE user_id = $1",
        user_id,
    )
    referral_rows = await pool.fetch(
        "SELECT id, code, referrer_user_id, referred_user_id, created_at, accepted_at, "
        "       bonus_granted_at "
        "FROM referrals WHERE referrer_user_id = $1 OR referred_user_id = $1 "
        "ORDER BY created_at",
        user_id,
    )

    export = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": dict(profile_row),
        "tenant": dict(tenant_row) if tenant_row else None,
        "preferences": dict(preferences_row) if preferences_row else None,
        "sessions": [dict(r) for r in session_rows],
        "conversations": [dict(r) for r in conversation_rows],
        "messages": [dict(r) for r in message_rows],
        "token_usage": [dict(r) for r in token_usage_rows],
        "notifications": [dict(r) for r in notification_rows],
        "audit_log": [dict(r) for r in audit_rows],
        "api_keys": [dict(r) for r in api_key_rows],
        "organization_memberships": [dict(r) for r in org_member_rows],
        "referrals": [dict(r) for r in referral_rows],
    }

    log_audit_event(
        pool,
        user_id,
        "account.exported",
        "user",
        user_id,
        ip_address=get_client_ip(request),
    )
    log.info("auth.account.exported", user_id=user_id)

    body = json.dumps(export, default=_json_default, indent=2)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"user-data-{user_id}-{timestamp}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
        pool,
        current_user.id,
        "account.deleted",
        "user",
        current_user.id,
        ip_address=get_client_ip(request),
    )
    # chat_sessions / session_token_usage have no FK on "user" — wipe rows owned
    # by this user (session_id is scoped as "{user_id}:{session_id}").
    session_prefix = f"{current_user.id}:%"
    await pool.execute("DELETE FROM chat_sessions WHERE session_id LIKE $1", session_prefix)
    await pool.execute(
        "DELETE FROM session_token_usage WHERE tenant_id = $1 OR session_id LIKE $2",
        current_user.id,
        session_prefix,
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
