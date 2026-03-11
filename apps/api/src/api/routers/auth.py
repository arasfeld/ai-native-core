"""Auth routes — register, login, and current-user info."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from ..auth import CurrentUser, create_access_token, hash_password, verify_password

log = structlog.get_logger()
router = APIRouter()


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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request) -> TokenResponse:
    """Create a new account and return an access token."""
    pool = request.app.state.db_pool
    existing = await pool.fetchrow("SELECT id FROM users WHERE email = $1", req.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    hashed = hash_password(req.password)
    row = await pool.fetchrow(
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
        req.email,
        hashed,
    )
    user = UserOut(id=row["id"], email=row["email"])
    token = create_access_token(user.id, user.email)
    log.info("auth.register", user_id=user.id, email=user.email)
    return TokenResponse(access_token=token, user=user)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request) -> TokenResponse:
    """Verify credentials and return an access token."""
    pool = request.app.state.db_pool
    row = await pool.fetchrow(
        "SELECT id, email, password FROM users WHERE email = $1", req.email
    )
    if not row or not verify_password(req.password, row["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user = UserOut(id=row["id"], email=row["email"])
    token = create_access_token(user.id, user.email)
    log.info("auth.login", user_id=user.id, email=user.email)
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser) -> UserOut:
    """Return the currently authenticated user."""
    return UserOut(id=current_user.id, email=current_user.email)
