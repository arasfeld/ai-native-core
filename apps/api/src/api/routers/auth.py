"""Auth routes — register, login, and current-user info."""

from __future__ import annotations

import structlog
from asyncer import asyncify
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from ..auth import CurrentUser, create_access_token, hash_password, verify_password
from ..config import settings

log = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])

_FREE_TOKEN_LIMIT = 100_000


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    tenant_id: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request) -> TokenResponse:
    """Create a new account (and personal tenant) and return an access token."""
    pool = request.app.state.db_pool
    existing = await pool.fetchrow("SELECT id FROM users WHERE email = $1", req.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    async with pool.acquire() as conn, conn.transaction():
        # Create a personal tenant for this user
        tenant_row = await conn.fetchrow(
            """
                INSERT INTO tenants (name, plan, token_limit)
                VALUES ($1, 'free', $2)
                RETURNING id
                """,
            req.email,
            _FREE_TOKEN_LIMIT,
        )
        tenant_id = tenant_row["id"]

        hashed = await asyncify(hash_password)(req.password)
        user_row = await conn.fetchrow(
            """
                INSERT INTO users (tenant_id, email, password)
                VALUES ($1, $2, $3)
                RETURNING id, email, tenant_id
                """,
            tenant_id,
            req.email,
            hashed,
        )

    user = UserOut(id=user_row["id"], email=user_row["email"], tenant_id=user_row["tenant_id"])
    token = create_access_token(user.id, user.email, user.tenant_id)
    log.info("auth.register", user_id=user.id, tenant_id=user.tenant_id)
    return TokenResponse(access_token=token, user=user)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request) -> TokenResponse:
    """Verify credentials and return an access token."""
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        "SELECT id, email, password, tenant_id FROM users WHERE email = $1", req.email
    )
    if not row or not await asyncify(verify_password)(req.password, row["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user = UserOut(id=row["id"], email=row["email"], tenant_id=row["tenant_id"])
    token = create_access_token(user.id, user.email, user.tenant_id)
    log.info("auth.login", user_id=user.id, tenant_id=user.tenant_id)
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    """Return the currently authenticated user."""
    return UserOut(id=current_user.id, email=current_user.email, tenant_id=current_user.tenant_id)


class InternalRegisterRequest(BaseModel):
    email: EmailStr


@router.post("/internal/register", include_in_schema=False)
async def internal_register(req: InternalRegisterRequest, request: Request) -> dict:
    """Provision a tenant + user record for a better-auth managed user.

    Called server-side by the Next.js layer after better-auth creates a new user.
    Never exposed in the public API schema.
    """
    if request.headers.get("x-internal-secret") != settings.internal_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal secret")

    pool = request.app.state.db_pool

    # Idempotent — return existing record if already provisioned
    existing = await pool.fetchrow(
        "SELECT id, tenant_id FROM users WHERE email = $1", req.email
    )
    if existing:
        return {"user_id": existing["id"], "tenant_id": existing["tenant_id"]}

    async with pool.acquire() as conn, conn.transaction():
        tenant_row = await conn.fetchrow(
            "INSERT INTO tenants (name, plan, token_limit) VALUES ($1, 'free', $2) RETURNING id",
            req.email,
            _FREE_TOKEN_LIMIT,
        )
        tenant_id = tenant_row["id"]
        user_row = await conn.fetchrow(
            "INSERT INTO users (tenant_id, email, password) VALUES ($1, $2, '') RETURNING id",
            tenant_id,
            req.email,
        )

    log.info("auth.internal_register", user_id=user_row["id"], tenant_id=tenant_id)
    return {"user_id": user_row["id"], "tenant_id": tenant_id}
