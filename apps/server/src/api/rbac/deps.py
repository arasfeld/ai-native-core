"""RBAC FastAPI dependency — require_permission factory."""

from __future__ import annotations

from fastapi import Depends, HTTPException

from ..auth.deps import CurrentUser
from .permissions import Permission


def require_permission(permission: Permission):
    """Return a FastAPI Depends that raises 403 if the current user lacks the permission."""

    async def _check(user: CurrentUser) -> None:
        if permission not in user.permissions:
            raise HTTPException(status_code=403, detail="Forbidden")

    return Depends(_check)
