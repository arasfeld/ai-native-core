"""FastAPI dependencies for authentication."""

from __future__ import annotations

from typing import Annotated

import asyncpg
import sentry_sdk
import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: str
    email: str
    org_id: str = ""
    name: str | None = None
    image: str | None = None
    email_verified: bool = False
    permissions: frozenset[str] = frozenset()


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> AuthUser:
    """Resolve the authenticated user and load their effective permissions."""
    pool: asyncpg.Pool = request.app.state.db_pool
    token = (
        credentials.credentials if credentials else request.cookies.get("better-auth.session_token")
    )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        session_token = token.split(".")[0]
        row = await pool.fetchrow(
            """
            SELECT u.id, u.email, u.name, u.image, u."emailVerified", u.banned
            FROM "user" u
            JOIN "session" s ON s."userId" = u.id
            WHERE s.token = $1 AND s."expiresAt" > NOW()
            """,
            session_token,
        )
    except Exception as exc:
        log.error("auth.db_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal authentication error",
        ) from exc

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    if row["banned"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account suspended",
        )

    # Load effective permissions: direct grants UNION role-derived (global scope only)
    perm_rows = await pool.fetch(
        """
        SELECT DISTINCT p.id
        FROM permissions p
        WHERE p.id IN (
          SELECT permission_id FROM user_permissions
          WHERE user_id = $1 AND org_id IS NULL
          UNION
          SELECT rp.permission_id
          FROM user_roles ur
          JOIN role_permissions rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = $1 AND ur.org_id IS NULL
        )
        """,
        row["id"],
    )

    user = AuthUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        email_verified=row["emailVerified"],
        permissions=frozenset(r["id"] for r in perm_rows),
    )

    # Resolve org_id: prefer X-Org-Id header, fallback to personal org (org_id = user_id)
    requested_org_id = request.headers.get("X-Org-Id")
    if requested_org_id:
        member_row = await pool.fetchrow(
            "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
            requested_org_id,
            user.id,
        )
        org_id = requested_org_id if member_row else user.id
    else:
        org_id = user.id

    resolved = user.model_copy(update={"org_id": org_id})
    sentry_sdk.set_user({"id": resolved.id})
    return resolved


async def get_optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> AuthUser | None:
    """Like get_current_user but returns None instead of raising on missing auth."""
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
OptionalUser = Annotated[AuthUser | None, Depends(get_optional_user)]
