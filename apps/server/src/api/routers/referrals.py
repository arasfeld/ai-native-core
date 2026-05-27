"""Referral routes — share-link codes and bonus token grants.

A referral grants `REFERRAL_BONUS_TOKENS` to BOTH the referrer and the new user.
The bonus is stored as `referral_bonus_tokens` on the tenants row and added to
the monthly `token_limit` by `SessionRepository.get_token_limit`.
"""

from __future__ import annotations

import secrets

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from ..auth import CurrentUser
from ..config import settings
from ..services.audit import get_client_ip, log_audit_event

log = structlog.get_logger()
router = APIRouter(prefix="/referrals", tags=["referrals"])

# One-time per-side bonus, added to the tenant's monthly budget.
REFERRAL_BONUS_TOKENS = 50_000


class ReferralOut(BaseModel):
    code: str
    url: str
    accepted_count: int
    bonus_tokens: int


class ReferralAcceptIn(BaseModel):
    code: str


class ReferralAcceptOut(BaseModel):
    accepted: bool
    bonus_tokens: int


def _make_code() -> str:
    """Eight URL-safe characters — ~48 bits of entropy."""
    return secrets.token_urlsafe(6)[:8]


async def _get_or_create_code(pool, user_id: str) -> str:
    row = await pool.fetchrow(
        "SELECT code FROM referrals WHERE referrer_user_id = $1 AND referred_user_id IS NULL "
        "ORDER BY created_at DESC LIMIT 1",
        user_id,
    )
    if row:
        return row["code"]
    # Insert with a few retries in the unlikely event of a code collision.
    for _ in range(5):
        candidate = _make_code()
        inserted = await pool.fetchrow(
            "INSERT INTO referrals (referrer_user_id, code) VALUES ($1, $2) "
            "ON CONFLICT (code) DO NOTHING RETURNING code",
            user_id,
            candidate,
        )
        if inserted:
            return inserted["code"]
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate referral code",
    )


@router.get("/me", response_model=ReferralOut)
async def get_my_referral(request: Request, current_user: CurrentUser) -> ReferralOut:
    """Return the current user's referral code, creating one if needed."""
    pool = request.app.state.db_pool
    code = await _get_or_create_code(pool, current_user.id)
    accepted = await pool.fetchval(
        "SELECT COUNT(*)::int FROM referrals "
        "WHERE referrer_user_id = $1 AND accepted_at IS NOT NULL",
        current_user.id,
    )
    return ReferralOut(
        code=code,
        url=f"{settings.web_url}/r/{code}",
        accepted_count=accepted or 0,
        bonus_tokens=REFERRAL_BONUS_TOKENS,
    )


@router.post("/accept", response_model=ReferralAcceptOut)
async def accept_referral(
    body: ReferralAcceptIn,
    request: Request,
    current_user: CurrentUser,
) -> ReferralAcceptOut:
    """Apply a referral code to the current user's account (idempotent, one per user).

    Validates that the code exists, isn't the user's own, and the user hasn't
    already accepted one. Grants `REFERRAL_BONUS_TOKENS` to both tenants.
    """
    pool = request.app.state.db_pool
    code = body.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Missing referral code")

    # Already accepted?
    existing = await pool.fetchrow(
        "SELECT id FROM referrals WHERE referred_user_id = $1",
        current_user.id,
    )
    if existing:
        return ReferralAcceptOut(accepted=False, bonus_tokens=0)

    referral = await pool.fetchrow(
        "SELECT id, referrer_user_id FROM referrals WHERE code = $1 AND referred_user_id IS NULL",
        code,
    )
    if not referral:
        raise HTTPException(status_code=404, detail="Referral code not found")
    if referral["referrer_user_id"] == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot refer yourself")

    referrer_id = referral["referrer_user_id"]

    # Mark accepted + grant bonus to both tenants atomically.
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(
            "UPDATE referrals "
            "SET referred_user_id = $1, accepted_at = NOW(), bonus_granted_at = NOW() "
            "WHERE id = $2",
            current_user.id,
            referral["id"],
        )
        await conn.execute(
            "UPDATE tenants SET referral_bonus_tokens = referral_bonus_tokens + $1 WHERE id = $2",
            REFERRAL_BONUS_TOKENS,
            referrer_id,
        )
        await conn.execute(
            "UPDATE tenants SET referral_bonus_tokens = referral_bonus_tokens + $1 WHERE id = $2",
            REFERRAL_BONUS_TOKENS,
            current_user.id,
        )

    log_audit_event(
        pool,
        current_user.id,
        "referral.accepted",
        "referral",
        str(referral["id"]),
        ip_address=get_client_ip(request),
        metadata={"referrer_id": referrer_id, "bonus_tokens": REFERRAL_BONUS_TOKENS},
    )
    log.info(
        "referral.accepted",
        user_id=current_user.id,
        referrer_id=referrer_id,
        bonus=REFERRAL_BONUS_TOKENS,
    )
    return ReferralAcceptOut(accepted=True, bonus_tokens=REFERRAL_BONUS_TOKENS)
