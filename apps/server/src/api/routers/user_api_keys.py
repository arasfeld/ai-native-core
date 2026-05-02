"""User API keys router — generate, list, and revoke personal API keys."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth.deps import AuthUser, get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/user/api-keys", tags=["user-api-keys"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class ApiKeyCreated(BaseModel):
    key: str
    id: str
    name: str
    key_prefix: str
    created_at: datetime


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


def _get_pool(request: Request):
    return request.app.state.db_pool


@router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(user: CurrentUser, request: Request):
    pool = _get_pool(request)
    rows = await pool.fetch(
        "SELECT id, name, key_prefix, created_at, last_used_at, revoked_at "
        "FROM user_api_keys WHERE user_id = $1 AND revoked_at IS NULL "
        "ORDER BY created_at DESC",
        user.id,
    )
    return [
        ApiKeyOut(
            id=str(row["id"]),
            name=row["name"],
            key_prefix=row["key_prefix"],
            created_at=row["created_at"],
            last_used_at=row["last_used_at"],
            revoked_at=row["revoked_at"],
        )
        for row in rows
    ]


@router.post("", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(body: CreateApiKeyRequest, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    full_key = "ak_" + secrets.token_hex(32)
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    key_prefix = full_key[:8]
    row = await pool.fetchrow(
        "INSERT INTO user_api_keys (user_id, name, key_hash, key_prefix) "
        "VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at",
        user.id,
        body.name,
        key_hash,
        key_prefix,
    )
    return ApiKeyCreated(
        key=full_key,
        id=str(row["id"]),
        name=row["name"],
        key_prefix=row["key_prefix"],
        created_at=row["created_at"],
    )


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, user: CurrentUser, request: Request):
    pool = _get_pool(request)
    row = await pool.fetchrow(
        "SELECT id FROM user_api_keys WHERE id = $1::uuid AND user_id = $2 AND revoked_at IS NULL",
        key_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="API key not found")
    await pool.execute(
        "UPDATE user_api_keys SET revoked_at = NOW() WHERE id = $1::uuid",
        key_id,
    )
