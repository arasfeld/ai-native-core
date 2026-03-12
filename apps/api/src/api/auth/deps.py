"""FastAPI dependencies for authentication."""

from __future__ import annotations

from typing import Annotated

import asyncpg
import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from pydantic import BaseModel

from ..config import settings
from .crypto import decode_token

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: int
    email: str
    tenant_id: int


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> AuthUser:
    """Resolve the authenticated user from either a trusted internal header or a Bearer JWT.

    Internal path: Next.js forwards X-User-Email + X-Internal-Secret (no password involved).
    JWT path: direct API clients (future mobile apps) send a Bearer token.
    """
    pool: asyncpg.Pool = request.app.state.db_pool

    # --- Internal trusted request from Next.js ---
    internal_secret = request.headers.get("x-internal-secret")
    user_email = request.headers.get("x-user-email")
    if internal_secret or user_email:
        if internal_secret != settings.internal_secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal secret")
        row = await pool.fetchrow(
            "SELECT id, email, tenant_id FROM users WHERE email = $1", user_email
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return AuthUser(id=row["id"], email=row["email"], tenant_id=row["tenant_id"])

    # --- JWT Bearer token (direct API clients) ---
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
    except JWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err

    row = await pool.fetchrow(
        "SELECT id, email, tenant_id FROM users WHERE id = $1", int(payload["sub"])
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return AuthUser(id=row["id"], email=row["email"], tenant_id=row["tenant_id"])


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
