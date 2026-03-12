"""FastAPI dependencies for authentication."""

from __future__ import annotations

from typing import Annotated

import asyncpg
import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from pydantic import BaseModel

from .crypto import decode_token

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: int
    email: str
    tenant_id: int


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthUser:
    """Resolve the authenticated user from a Bearer JWT.

    Raises 401 if no valid token is provided.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    pool: asyncpg.Pool = request.app.state.db_pool
    row = await pool.fetchrow(
        "SELECT id, email, tenant_id FROM users WHERE id = $1", int(payload["sub"])
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return AuthUser(id=row["id"], email=row["email"], tenant_id=row["tenant_id"])


async def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthUser | None:
    """Like get_current_user but returns None instead of raising on missing auth."""
    if not credentials:
        return None
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
OptionalUser = Annotated[AuthUser | None, Depends(get_optional_user)]
