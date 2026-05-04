"""Organizations router — org settings, members, invites, invite links, join."""

from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth.deps import AuthUser, get_current_user

router = APIRouter(tags=["organizations"])
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]

_ROLE_HIERARCHY = {"member": 0, "admin": 1, "owner": 2}


def require_org_role(min_role: str):
    """Dependency factory: raise 403 if caller's role in current org is below min_role."""

    async def _check(request: Request, user: CurrentUser):
        pool: asyncpg.Pool = request.app.state.db_pool
        row = await pool.fetchrow(
            "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
            user.org_id,
            user.id,
        )
        if not row or _ROLE_HIERARCHY.get(row["role"], -1) < _ROLE_HIERARCHY[min_role]:
            raise HTTPException(status_code=403, detail="Insufficient org role")
        return row["role"]

    return Depends(_check)


def _pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


# ---------------------------------------------------------------------------
# Org settings
# ---------------------------------------------------------------------------


class OrgOut(BaseModel):
    id: str
    name: str
    slug: str | None
    logo_url: str | None
    invite_link_enabled: bool
    role: str


class OrgUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    logo_url: str | None = None


@router.get("/organizations/current", response_model=OrgOut)
async def get_current_org(user: CurrentUser, request: Request):
    pool = _pool(request)
    row = await pool.fetchrow(
        """
        SELECT t.id, t.name, t.slug, t.logo_url, t.invite_link_enabled,
               om.role
        FROM tenants t
        JOIN organization_members om ON om.org_id = t.id AND om.user_id = $2
        WHERE t.id = $1
        """,
        user.org_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrgOut(**dict(row))


@router.patch(
    "/organizations/current",
    response_model=OrgOut,
    dependencies=[require_org_role("admin")],
)
async def update_current_org(body: OrgUpdate, user: CurrentUser, request: Request):
    pool = _pool(request)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")
    set_clause = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(updates))
    await pool.execute(
        f"UPDATE tenants SET {set_clause} WHERE id = $1",
        user.org_id,
        *updates.values(),
    )
    return await get_current_org(user, request)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------


class MemberOut(BaseModel):
    user_id: str
    email: str
    name: str | None
    role: str
    joined_at: datetime


class RoleUpdate(BaseModel):
    role: str


@router.get("/organizations/current/members", response_model=list[MemberOut])
async def list_members(user: CurrentUser, request: Request):
    pool = _pool(request)
    rows = await pool.fetch(
        """
        SELECT om.user_id, u.email, u.name, om.role, om.joined_at
        FROM organization_members om
        JOIN "user" u ON u.id = om.user_id
        WHERE om.org_id = $1
        ORDER BY om.joined_at
        """,
        user.org_id,
    )
    return [MemberOut(**dict(r)) for r in rows]


@router.patch(
    "/organizations/current/members/{target_user_id}",
    response_model=MemberOut,
    dependencies=[require_org_role("owner")],
)
async def change_member_role(
    target_user_id: str,
    body: RoleUpdate,
    user: CurrentUser,
    request: Request,
):
    pool = _pool(request)
    if body.role not in _ROLE_HIERARCHY:
        raise HTTPException(status_code=422, detail="Invalid role")
    row = await pool.fetchrow(
        "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
        user.org_id,
        target_user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")
    await pool.execute(
        "UPDATE organization_members SET role = $1 WHERE org_id = $2 AND user_id = $3",
        body.role,
        user.org_id,
        target_user_id,
    )
    updated = await pool.fetchrow(
        """
        SELECT om.user_id, u.email, u.name, om.role, om.joined_at
        FROM organization_members om JOIN "user" u ON u.id = om.user_id
        WHERE om.org_id = $1 AND om.user_id = $2
        """,
        user.org_id,
        target_user_id,
    )
    return MemberOut(**dict(updated))


@router.delete(
    "/organizations/current/members/{target_user_id}",
    status_code=204,
    dependencies=[require_org_role("admin")],
)
async def remove_member(target_user_id: str, user: CurrentUser, request: Request):
    pool = _pool(request)
    owner_count = await pool.fetchval(
        "SELECT COUNT(*) FROM organization_members WHERE org_id = $1 AND role = 'owner'",
        user.org_id,
    )
    target_role = await pool.fetchrow(
        "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
        user.org_id,
        target_user_id,
    )
    if not target_role:
        raise HTTPException(status_code=404, detail="Member not found")
    if target_role["role"] == "owner" and owner_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the sole owner")
    await pool.execute(
        "DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2",
        user.org_id,
        target_user_id,
    )


# ---------------------------------------------------------------------------
# Email invites
# ---------------------------------------------------------------------------


class InviteCreate(BaseModel):
    email: str
    role: str = "member"


class InviteOut(BaseModel):
    id: str
    email: str
    role: str
    token: str
    expires_at: datetime
    created_at: datetime


@router.post(
    "/organizations/current/invites",
    response_model=InviteOut,
    status_code=201,
    dependencies=[require_org_role("admin")],
)
async def create_invite(body: InviteCreate, user: CurrentUser, request: Request):
    pool = _pool(request)
    if body.role not in _ROLE_HIERARCHY:
        raise HTTPException(status_code=422, detail="Invalid role")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    row = await pool.fetchrow(
        """
        INSERT INTO organization_invites (org_id, email, role, token, invited_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, role, token, expires_at, created_at
        """,
        user.org_id,
        body.email,
        body.role,
        token,
        user.id,
        expires_at,
    )
    asyncio.ensure_future(
        _send_invite_email(
            to=body.email,
            org_id=user.org_id,
            inviter_id=user.id,
            role=body.role,
            token=token,
            pool=pool,
        )
    )
    return InviteOut(
        id=str(row["id"]),
        email=row["email"],
        role=row["role"],
        token=row["token"],
        expires_at=row["expires_at"],
        created_at=row["created_at"],
    )


@router.get(
    "/organizations/current/invites",
    response_model=list[InviteOut],
    dependencies=[require_org_role("admin")],
)
async def list_invites(user: CurrentUser, request: Request):
    pool = _pool(request)
    rows = await pool.fetch(
        """
        SELECT id, email, role, token, expires_at, created_at
        FROM organization_invites
        WHERE org_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        """,
        user.org_id,
    )
    return [
        InviteOut(
            id=str(r["id"]),
            email=r["email"],
            role=r["role"],
            token=r["token"],
            expires_at=r["expires_at"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.delete(
    "/organizations/current/invites/{invite_id}",
    status_code=204,
    dependencies=[require_org_role("admin")],
)
async def revoke_invite(invite_id: str, user: CurrentUser, request: Request):
    pool = _pool(request)
    result = await pool.execute(
        "DELETE FROM organization_invites WHERE id = $1::uuid AND org_id = $2",
        invite_id,
        user.org_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Invite not found")


# ---------------------------------------------------------------------------
# Shareable invite link
# ---------------------------------------------------------------------------


class InviteLinkOut(BaseModel):
    enabled: bool
    token: str | None


class InviteLinkUpdate(BaseModel):
    enabled: bool


@router.get(
    "/organizations/current/invite-link",
    response_model=InviteLinkOut,
    dependencies=[require_org_role("admin")],
)
async def get_invite_link(user: CurrentUser, request: Request):
    pool = _pool(request)
    row = await pool.fetchrow(
        "SELECT invite_link_token, invite_link_enabled FROM tenants WHERE id = $1",
        user.org_id,
    )
    return InviteLinkOut(enabled=row["invite_link_enabled"], token=row["invite_link_token"])


@router.patch(
    "/organizations/current/invite-link",
    response_model=InviteLinkOut,
    dependencies=[require_org_role("admin")],
)
async def update_invite_link(body: InviteLinkUpdate, user: CurrentUser, request: Request):
    pool = _pool(request)
    await pool.execute(
        "UPDATE tenants SET invite_link_enabled = $1 WHERE id = $2",
        body.enabled,
        user.org_id,
    )
    return await get_invite_link(user, request)


@router.post(
    "/organizations/current/invite-link/reset",
    response_model=InviteLinkOut,
    dependencies=[require_org_role("admin")],
)
async def reset_invite_link(user: CurrentUser, request: Request):
    pool = _pool(request)
    new_token = secrets.token_urlsafe(32)
    await pool.execute(
        "UPDATE tenants SET invite_link_token = $1 WHERE id = $2",
        new_token,
        user.org_id,
    )
    return await get_invite_link(user, request)


# ---------------------------------------------------------------------------
# Join via token (public + authenticated)
# ---------------------------------------------------------------------------


class JoinInfo(BaseModel):
    org_name: str
    role: str
    invite_type: str  # 'email' | 'link'


class JoinResult(BaseModel):
    org_id: str
    role: str


async def _resolve_token(pool: asyncpg.Pool, token: str) -> tuple[dict, str]:
    """Return (data_dict, invite_type) or raise 404/410."""
    # Check email invite first
    invite = await pool.fetchrow(
        """
        SELECT oi.id, oi.org_id, oi.role, oi.expires_at, oi.accepted_at,
               oi.invited_by, t.name AS org_name
        FROM organization_invites oi
        JOIN tenants t ON t.id = oi.org_id
        WHERE oi.token = $1
        """,
        token,
    )
    if invite:
        if invite["expires_at"].replace(tzinfo=UTC) < datetime.now(UTC):
            raise HTTPException(status_code=410, detail="Invite has expired")
        if invite["accepted_at"]:
            raise HTTPException(status_code=410, detail="Invite already accepted")
        return dict(invite), "email"

    # Check link invite
    org_row = await pool.fetchrow(
        "SELECT id, name, invite_link_enabled, invite_link_token FROM tenants WHERE invite_link_token = $1",
        token,
    )
    if org_row:
        if not org_row["invite_link_enabled"]:
            raise HTTPException(status_code=410, detail="Invite link is disabled")
        return dict(org_row), "link"

    raise HTTPException(status_code=404, detail="Token not found")


@router.get("/join/{token}", response_model=JoinInfo)
async def validate_join_token(token: str, request: Request):
    pool = _pool(request)
    data, invite_type = await _resolve_token(pool, token)
    org_name = data.get("org_name") or data.get("name", "")
    role = data.get("role", "member")
    return JoinInfo(org_name=org_name, role=role, invite_type=invite_type)


@router.post("/join/{token}", response_model=JoinResult)
async def accept_join(token: str, user: CurrentUser, request: Request):
    pool = _pool(request)
    data, invite_type = await _resolve_token(pool, token)

    if invite_type == "email":
        org_id = data["org_id"]
        role = data["role"]
    else:
        org_id = data["id"]
        role = "member"

    # Already a member → return current role
    existing = await pool.fetchrow(
        "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
        org_id,
        user.id,
    )
    if existing:
        return JoinResult(org_id=org_id, role=existing["role"])

    await pool.execute(
        """
        INSERT INTO organization_members (org_id, user_id, role, invited_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (org_id, user_id) DO NOTHING
        """,
        org_id,
        user.id,
        role,
        data.get("invited_by"),
    )

    if invite_type == "email":
        await pool.execute(
            "UPDATE organization_invites SET accepted_at = NOW() WHERE id = $1",
            data["id"],
        )

    return JoinResult(org_id=org_id, role=role)


# ---------------------------------------------------------------------------
# Invite email (best-effort, fire-and-forget)
# ---------------------------------------------------------------------------


async def _send_invite_email(
    to: str,
    org_id: str,
    inviter_id: str,
    role: str,
    token: str,
    pool: asyncpg.Pool,
) -> None:
    try:
        from ..config import settings

        if not settings.resend_api_key:
            return

        org_row = await pool.fetchrow("SELECT name FROM tenants WHERE id = $1", org_id)
        inviter_row = await pool.fetchrow(
            'SELECT name, email FROM "user" WHERE id = $1', inviter_id
        )
        if not org_row or not inviter_row:
            return

        org_name = org_row["name"]
        inviter_name = inviter_row["name"] or inviter_row["email"]
        accept_url = f"{settings.cors_origin}/join/{token}"

        import resend as resend_sdk

        resend_sdk.api_key = settings.resend_api_key
        html = (
            f"<p>Hi,</p>"
            f"<p>{inviter_name} has invited you to join <strong>{org_name}</strong> as a {role}.</p>"
            f'<p><a href="{accept_url}">Accept Invitation</a></p>'
            f"<p>This invite expires in 7 days.</p>"
        )
        resend_sdk.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": [to],
                "subject": f"You've been invited to join {org_name}",
                "html": html,
            }
        )
    except Exception:
        pass  # email is non-critical
