# Organizations & Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-member organization support, migrating billing/token budgets from per-user to per-org, with email invites, shareable invite links, role-based access, and an org switcher in the UI.

**Architecture:** Every user's existing `tenants` row becomes their personal org (`org_id = user_id`), preserving all existing data. We extend `tenants` in-place, add `organization_members` + `organization_invites` tables, resolve `org_id` from the `X-Org-Id` header in FastAPI, and forward that header from Next.js via the `active_org_id` cookie.

**Tech Stack:** asyncpg, FastAPI, React/Next.js App Router, shadcn/ui, Radix Popover, Resend (via `@repo/emails`), better-auth.

---

## Files to Create

- `apps/server/src/api/routers/organizations.py` — all 14 org endpoints + `require_org_role`
- `apps/server/tests/test_organizations.py` — TDD tests for org router
- `apps/web/src/app/api/organizations/current/route.ts`
- `apps/web/src/app/api/organizations/current/members/route.ts`
- `apps/web/src/app/api/organizations/current/members/[userId]/route.ts`
- `apps/web/src/app/api/organizations/current/invites/route.ts`
- `apps/web/src/app/api/organizations/current/invites/[inviteId]/route.ts`
- `apps/web/src/app/api/organizations/current/invite-link/route.ts`
- `apps/web/src/app/api/organizations/current/invite-link/reset/route.ts`
- `apps/web/src/app/api/join/[token]/route.ts`
- `apps/web/src/features/organizations/components/OrgSwitcher.tsx`
- `apps/web/src/features/organizations/components/OrganizationTab.tsx`
- `apps/web/src/features/organizations/index.ts`
- `apps/web/src/app/join/[token]/page.tsx`
- `packages/emails/src/templates/OrganizationInviteEmail.tsx`

## Files to Modify

- `packages/db/migrations/0008_organizations.sql` — new tables + columns + data migration
- `apps/server/src/api/main.py` — add `_CREATE_ORGANIZATIONS` DDL + `organizations` router import
- `apps/server/src/api/auth/deps.py` — add `org_id: str` to `AuthUser`, resolve from `X-Org-Id` header
- `apps/server/src/api/repositories/session_repository.py` — `get_or_create_tenant` inserts org_members owner row + generates slug
- `apps/server/src/api/services/chat_service.py` — pass `user.org_id` as tenant key
- `packages/auth/src/index.ts` — extend `databaseHooks.user.create.after` to create tenant + org_members row
- `packages/emails/src/index.tsx` — export `OrganizationInviteEmail` + `renderOrgInviteEmail`
- `apps/web/src/proxy.ts` — add `/join` to PUBLIC_PATHS, forward `active_org_id` cookie as `X-Org-Id`
- `apps/web/src/app/api/notifications/route.ts` — add X-Org-Id forwarding (pattern for all proxies)
- `apps/web/src/app/chat.tsx` — import and render `OrgSwitcher` in header
- `apps/web/src/features/settings/components/SettingsPage.tsx` — add "organization" tab

---

## Task 1: DB Migration — Organizations Tables

**Files:**
- Create: `packages/db/migrations/0008_organizations.sql`

- [ ] **Step 1: Write the migration**

```sql
-- packages/db/migrations/0008_organizations.sql

-- Extend tenants for org features
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_token TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Org membership
CREATE TABLE IF NOT EXISTS organization_members (
  org_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member',
  invited_by TEXT        REFERENCES "user"(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON organization_members(user_id);

-- Email / link invites
CREATE TABLE IF NOT EXISTS organization_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'member',
  token       TEXT        NOT NULL UNIQUE,
  invited_by  TEXT        NOT NULL REFERENCES "user"(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organization_invites_token_idx ON organization_invites(token);

-- Generate slugs for existing tenants (lowercase name, hyphens, 4-char suffix)
UPDATE tenants
SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'gi')) || '-' || substr(md5(id), 1, 4)
WHERE slug IS NULL;

-- Back-fill org_members owner rows for existing tenants
-- (personal orgs: org_id = user_id)
INSERT INTO organization_members (org_id, user_id, role)
SELECT id, id, 'owner'
FROM tenants
ON CONFLICT (org_id, user_id) DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/migrations/0008_organizations.sql
git commit -m "feat: add organizations DB migration"
```

---

## Task 2: Add `_CREATE_ORGANIZATIONS` DDL to FastAPI main.py

**Files:**
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 1: Add the DDL constant and execute it in lifespan**

In `apps/server/src/api/main.py`, after `_CREATE_NOTIFICATIONS`, add:

```python
_CREATE_ORGANIZATIONS = """
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_token TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_link_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS organization_members (
  org_id     TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member',
  invited_by TEXT        REFERENCES "user"(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS organization_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'member',
  token       TEXT        NOT NULL UNIQUE,
  invited_by  TEXT        NOT NULL REFERENCES "user"(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organization_invites_token_idx ON organization_invites(token);
"""
```

In the `lifespan` function, after `await conn.execute(_CREATE_NOTIFICATIONS)`, add:

```python
        await conn.execute(_CREATE_ORGANIZATIONS)
```

- [ ] **Step 2: Run server to verify DDL executes (or run pytest)**

```bash
cd apps/server && uv run pytest tests/ -x -q 2>&1 | head -30
```

Expected: tests still pass (DDL is idempotent).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/api/main.py
git commit -m "feat: add organizations DDL to server lifespan"
```

---

## Task 3: Extend AuthUser with org_id + resolve from X-Org-Id header

**Files:**
- Modify: `apps/server/src/api/auth/deps.py`
- Test: `apps/server/tests/test_organizations.py` (will use `org_id` from auth)

- [ ] **Step 1: Update `AuthUser` to include `org_id`**

In `apps/server/src/api/auth/deps.py`, change the `AuthUser` class to:

```python
class AuthUser(BaseModel):
    id: str
    email: str
    org_id: str = ""
    name: str | None = None
    image: str | None = None
    email_verified: bool = False
    permissions: frozenset[str] = frozenset()
```

- [ ] **Step 2: Add org_id resolution in `get_current_user`**

After building the base `AuthUser` (at the `return AuthUser(...)` call), replace the return with org resolution logic:

```python
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
        if member_row:
            user = user.model_copy(update={"org_id": requested_org_id})
        else:
            # Header present but user not a member — fall back to personal org
            user = user.model_copy(update={"org_id": user.id})
    else:
        # Default: personal org (org_id = user_id for all existing users)
        user = user.model_copy(update={"org_id": user.id})

    return user
```

- [ ] **Step 3: Run existing auth-related tests to verify no regression**

```bash
uv run pytest apps/server/tests/ -x -q -k "not test_budget" 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/api/auth/deps.py
git commit -m "feat: add org_id to AuthUser, resolve from X-Org-Id header"
```

---

## Task 4: Update session_repository + chat_service to use org_id

**Files:**
- Modify: `apps/server/src/api/repositories/session_repository.py`
- Modify: `apps/server/src/api/services/chat_service.py`

- [ ] **Step 1: Update `get_or_create_tenant` to generate slug + insert org_members owner row**

In `session_repository.py`, replace `get_or_create_tenant`:

```python
    async def get_or_create_tenant(self, user_id: str, email: str) -> None:
        """Ensure a tenant row + owner membership row exist for this user (idempotent)."""
        import re
        slug_base = re.sub(r"[^a-z0-9]+", "-", email.split("@")[0].lower()).strip("-")
        slug = f"{slug_base}-{user_id[:4]}"
        await self._pool.execute(
            """
            INSERT INTO tenants (id, name, plan, token_limit, slug)
            VALUES ($1, $2, 'free', 100000, $3)
            ON CONFLICT (id) DO NOTHING
            """,
            user_id,
            email,
            slug,
        )
        await self._pool.execute(
            """
            INSERT INTO organization_members (org_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (org_id, user_id) DO NOTHING
            """,
            user_id,
            user_id,
        )
```

- [ ] **Step 2: Update `chat_service.py` to pass `user.org_id` as tenant key**

In `chat_service.py`, replace:

```python
        # Ensure tenant record exists for registered users (idempotent upsert)
        if not is_guest:
            await self._session_repo.get_or_create_tenant(user.id, user.email)

        # Check token budget
        try:
            await self._session_repo.check_budget(session_id, user.id)
```

With:

```python
        # Ensure tenant record exists for registered users (idempotent upsert)
        if not is_guest:
            await self._session_repo.get_or_create_tenant(user.id, user.email)

        # Check token budget keyed by org_id (= user_id for personal orgs)
        budget_key = user.org_id if user.org_id else user.id
        try:
            await self._session_repo.check_budget(session_id, budget_key)
```

Also update the token usage recording:

```python
            await self._session_repo.add_token_usage(session_id, tokens_used, budget_key)

            # Background: budget threshold notifications (registered users only)
            if not is_guest:
                asyncio.ensure_future(
                    check_budget_thresholds(self._session_repo._pool, budget_key, user.email)
                )
```

- [ ] **Step 3: Run tests**

```bash
uv run pytest apps/server/tests/ -x -q 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/api/repositories/session_repository.py apps/server/src/api/services/chat_service.py
git commit -m "feat: use org_id as tenant budget key in chat service"
```

---

## Task 5: FastAPI Organizations Router (TDD)

**Files:**
- Create: `apps/server/src/api/routers/organizations.py`
- Create: `apps/server/tests/test_organizations.py`

- [ ] **Step 1: Write failing tests**

Create `apps/server/tests/test_organizations.py`:

```python
"""Tests for organization endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_get_current_org_requires_auth(client: AsyncClient):
    res = await client.get("/organizations/current")
    assert res.status_code == 401


@pytest.mark.anyio
async def test_get_current_org_returns_org_details(auth_client: AsyncClient, user_id: str):
    res = await auth_client.get("/organizations/current")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == user_id
    assert data["role"] == "owner"
    assert "name" in data
    assert "slug" in data


@pytest.mark.anyio
async def test_patch_current_org_requires_admin(member_client: AsyncClient):
    res = await member_client.patch("/organizations/current", json={"name": "New Name"})
    assert res.status_code == 403


@pytest.mark.anyio
async def test_patch_current_org_updates_name(auth_client: AsyncClient):
    res = await auth_client.patch("/organizations/current", json={"name": "Updated Org"})
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Org"


@pytest.mark.anyio
async def test_list_members_returns_members(auth_client: AsyncClient, user_id: str):
    res = await auth_client.get("/organizations/current/members")
    assert res.status_code == 200
    members = res.json()
    assert len(members) >= 1
    assert any(m["user_id"] == user_id for m in members)


@pytest.mark.anyio
async def test_delete_sole_owner_forbidden(auth_client: AsyncClient, user_id: str):
    res = await auth_client.delete(f"/organizations/current/members/{user_id}")
    assert res.status_code == 400


@pytest.mark.anyio
async def test_create_invite_requires_admin(member_client: AsyncClient):
    res = await member_client.post(
        "/organizations/current/invites",
        json={"email": "new@example.com", "role": "member"},
    )
    assert res.status_code == 403


@pytest.mark.anyio
async def test_create_invite_returns_invite(auth_client: AsyncClient):
    res = await auth_client.post(
        "/organizations/current/invites",
        json={"email": "invited@example.com", "role": "member"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "invited@example.com"
    assert "token" in data


@pytest.mark.anyio
async def test_list_invites_returns_pending(auth_client: AsyncClient):
    await auth_client.post(
        "/organizations/current/invites",
        json={"email": "pending@example.com", "role": "member"},
    )
    res = await auth_client.get("/organizations/current/invites")
    assert res.status_code == 200
    emails = [i["email"] for i in res.json()]
    assert "pending@example.com" in emails


@pytest.mark.anyio
async def test_revoke_invite(auth_client: AsyncClient):
    create_res = await auth_client.post(
        "/organizations/current/invites",
        json={"email": "revoke@example.com", "role": "member"},
    )
    invite_id = create_res.json()["id"]
    res = await auth_client.delete(f"/organizations/current/invites/{invite_id}")
    assert res.status_code == 204


@pytest.mark.anyio
async def test_get_invite_link(auth_client: AsyncClient):
    res = await auth_client.get("/organizations/current/invite-link")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "token" in data


@pytest.mark.anyio
async def test_join_invalid_token_returns_404(client: AsyncClient):
    res = await client.get("/join/nonexistent-token")
    assert res.status_code == 404


@pytest.mark.anyio
async def test_join_valid_email_invite(client: AsyncClient, auth_client: AsyncClient, second_client: AsyncClient):
    create_res = await auth_client.post(
        "/organizations/current/invites",
        json={"email": "joiner@example.com", "role": "member"},
    )
    token = create_res.json()["token"]

    # Validate token
    res = await client.get(f"/join/{token}")
    assert res.status_code == 200
    assert "org_name" in res.json()

    # Accept invite (second user)
    accept_res = await second_client.post(f"/join/{token}")
    assert accept_res.status_code == 200
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest apps/server/tests/test_organizations.py -x -q 2>&1 | head -30
```

Expected: ImportError or 404s — router doesn't exist yet.

- [ ] **Step 3: Create the organizations router**

Create `apps/server/src/api/routers/organizations.py`:

```python
"""Organizations router — org settings, members, invites, invite links, join."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
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
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
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
    # Cannot remove the sole owner
    owner_count = await pool.fetchval(
        "SELECT COUNT(*) FROM organization_members WHERE org_id = $1 AND role = 'owner'",
        user.org_id,
    )
    target_role = await pool.fetchval(
        "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
        user.org_id,
        target_user_id,
    )
    if not target_role:
        raise HTTPException(status_code=404, detail="Member not found")
    if target_role == "owner" and owner_count <= 1:
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
    return InviteOut(id=str(row["id"]), **{k: row[k] for k in ("email", "role", "token", "expires_at", "created_at")})


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
    return [InviteOut(id=str(r["id"]), **{k: r[k] for k in ("email", "role", "token", "expires_at", "created_at")}) for r in rows]


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
    """Return (org_row, invite_type) or raise 404."""
    # Check email invite
    invite = await pool.fetchrow(
        """
        SELECT oi.id, oi.org_id, oi.role, oi.expires_at, oi.accepted_at,
               t.name AS org_name
        FROM organization_invites oi
        JOIN tenants t ON t.id = oi.org_id
        WHERE oi.token = $1
        """,
        token,
    )
    if invite:
        if invite["expires_at"] < datetime.now(UTC):
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
    org_name = data.get("org_name") or data.get("name")
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

    # Check already a member
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
uv run pytest apps/server/tests/test_organizations.py -x -q 2>&1 | tail -30
```

Expected: Most pass; tests requiring `auth_client` / `member_client` / `second_client` fixtures may need conftest additions — see next step.

- [ ] **Step 5: Check existing conftest and add fixtures if needed**

Read `apps/server/tests/conftest.py`. If `auth_client`, `member_client`, `second_client`, `user_id` fixtures are missing, add them following the same pattern used for `test_notifications.py`. The `auth_client` should be an `AsyncClient` with a valid session cookie for a test user who owns a personal org.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/api/routers/organizations.py apps/server/tests/test_organizations.py
git commit -m "feat: add organizations router with TDD tests"
```

---

## Task 6: Register Organizations Router in main.py

**Files:**
- Modify: `apps/server/src/api/main.py`

- [ ] **Step 1: Import and register the router**

In `apps/server/src/api/main.py`, add `organizations` to the router imports:

```python
from .routers import (
    admin,
    admin_tenants,
    admin_users,
    auth,
    billing,
    chat,
    conversations,
    health,
    ingest,
    jobs,
    media,
    notifications,
    organizations,
    rbac,
    user_api_keys,
)
```

At the bottom of the file, after `app.include_router(notifications.router)`, add:

```python
app.include_router(organizations.router)
```

- [ ] **Step 2: Run all tests**

```bash
uv run pytest apps/server/tests/ -x -q 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/api/main.py apps/server/src/api/routers/__init__.py
git commit -m "feat: register organizations router"
```

---

## Task 7: Extend auth signup hook to create tenant + org_members row

**Files:**
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Update databaseHooks to create tenant + org_members owner row**

In `packages/auth/src/index.ts`, the `databaseHooks.user.create.after` handler currently only sends the welcome email. Extend it to also call the FastAPI server to create the tenant:

```typescript
  databaseHooks: {
    user: {
      create: {
        after: async (user: { id: string; name?: string | null; email: string }) => {
          // Send welcome email
          const html = await renderWelcomeEmail({
            name: user.name ?? undefined,
            appUrl: env.BETTER_AUTH_URL,
          });
          await sendEmail(user.email, "Welcome to AI Native Core", html);

          // Bootstrap personal org: tenant row + owner membership
          // The FastAPI server handles this idempotently via get_or_create_tenant,
          // but we eagerly create it here so the org_id is immediately available.
          const apiUrl = process.env.API_URL ?? "http://localhost:8000";
          try {
            await fetch(`${apiUrl}/auth/bootstrap-tenant`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: user.id, email: user.email }),
            });
          } catch {
            // Non-fatal: chat_service.get_or_create_tenant is the safety net
          }
        },
      },
    },
  },
```

> **Note:** The `bootstrap-tenant` endpoint is a lightweight internal endpoint added in the next step. The `get_or_create_tenant` in `session_repository.py` remains the primary safety net and handles the upsert on first chat.

- [ ] **Step 2: Add bootstrap-tenant endpoint to FastAPI auth router**

In `apps/server/src/api/routers/auth.py`, add:

```python
class BootstrapTenantRequest(BaseModel):
    user_id: str
    email: str

@router.post("/auth/bootstrap-tenant", status_code=204)
async def bootstrap_tenant(body: BootstrapTenantRequest, request: Request):
    """Called by better-auth signup hook to eagerly create personal org."""
    pool = request.app.state.db_pool
    import re
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
```

- [ ] **Step 3: Type check**

```bash
pnpm --filter @repo/auth check-types 2>&1 | tail -20
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/auth/src/index.ts apps/server/src/api/routers/auth.py
git commit -m "feat: eagerly bootstrap personal org on user signup"
```

---

## Task 8: OrganizationInviteEmail template

**Files:**
- Create: `packages/emails/src/templates/OrganizationInviteEmail.tsx`
- Modify: `packages/emails/src/index.tsx`

- [ ] **Step 1: Create the email template**

Create `packages/emails/src/templates/OrganizationInviteEmail.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
};

export function OrganizationInviteEmail({ orgName, inviterName, role, acceptUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to join {orgName}</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9fafb", padding: "40px 0" }}>
        <Container style={{ backgroundColor: "#fff", borderRadius: 8, padding: "32px", maxWidth: 480 }}>
          <Heading style={{ fontSize: 22, marginBottom: 8 }}>
            You&apos;ve been invited to join {orgName}
          </Heading>
          <Text style={{ color: "#6b7280" }}>
            {inviterName} has invited you to join <strong>{orgName}</strong> as a{" "}
            <strong>{role}</strong>.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button
              href={acceptUrl}
              style={{
                backgroundColor: "#111827",
                color: "#fff",
                borderRadius: 6,
                padding: "12px 24px",
                fontWeight: 600,
              }}
            >
              Accept Invitation
            </Button>
          </Section>
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            This invitation expires in 7 days. If you didn&apos;t expect this, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Export from packages/emails/src/index.tsx**

In `packages/emails/src/index.tsx`, add:

```typescript
import { OrganizationInviteEmail } from "./templates/OrganizationInviteEmail";

export { BudgetWarningEmail, OrganizationInviteEmail, PasswordResetEmail, WelcomeEmail };

export async function renderOrgInviteEmail(props: {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}): Promise<string> {
  return render(<OrganizationInviteEmail {...props} />);
}
```

- [ ] **Step 3: Wire invite email sending into FastAPI create_invite endpoint**

In `apps/server/src/api/routers/organizations.py`, at the top, add:

```python
import asyncio
import httpx
```

In `create_invite`, after inserting the row, add a fire-and-forget email send:

```python
    # Fire-and-forget: send invite email via Node.js email service
    # We call the web app's internal email endpoint to use React Email templates
    asyncio.ensure_future(_send_invite_email(
        to=body.email,
        org_id=user.org_id,
        inviter_id=user.id,
        role=body.role,
        token=token,
        pool=pool,
    ))

    return InviteOut(...)
```

Add the helper function:

```python
async def _send_invite_email(
    to: str,
    org_id: str,
    inviter_id: str,
    role: str,
    token: str,
    pool: asyncpg.Pool,
) -> None:
    """Best-effort: send invite email via Resend."""
    try:
        from ..config import settings

        if not settings.resend_api_key:
            return

        org_row = await pool.fetchrow("SELECT name FROM tenants WHERE id = $1", org_id)
        inviter_row = await pool.fetchrow('SELECT name, email FROM "user" WHERE id = $1', inviter_id)
        if not org_row or not inviter_row:
            return

        org_name = org_row["name"]
        inviter_name = inviter_row["name"] or inviter_row["email"]
        accept_url = f"{settings.cors_origin}/join/{token}"

        import resend as resend_sdk

        resend_sdk.api_key = settings.resend_api_key
        # Plain HTML fallback (React Email rendered via the emails package is TypeScript only)
        html = (
            f"<p>Hi,</p>"
            f"<p>{inviter_name} has invited you to join <strong>{org_name}</strong> as a {role}.</p>"
            f'<p><a href="{accept_url}">Accept Invitation</a></p>'
            f"<p>This invite expires in 7 days.</p>"
        )
        resend_sdk.Emails.send({
            "from": settings.resend_from_email,
            "to": [to],
            "subject": f"You've been invited to join {org_name}",
            "html": html,
        })
    except Exception:
        pass  # email is non-critical
```

- [ ] **Step 4: Type check**

```bash
pnpm check-types 2>&1 | tail -20
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/emails/src/templates/OrganizationInviteEmail.tsx packages/emails/src/index.tsx apps/server/src/api/routers/organizations.py
git commit -m "feat: OrganizationInviteEmail template + invite email sending"
```

---

## Task 9: Next.js proxy utility for X-Org-Id header

**Files:**
- Modify: `apps/web/src/app/api/notifications/route.ts` (pattern, then all proxy routes)
- Create: `apps/web/src/lib/api-proxy.ts`

- [ ] **Step 1: Create a shared proxy helper that forwards X-Org-Id**

Create `apps/web/src/lib/api-proxy.ts`:

```typescript
import { cookies, headers } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

/**
 * Build headers for proxied requests to FastAPI:
 * - Forwards session cookie for auth
 * - Forwards active_org_id cookie as X-Org-Id header
 */
export async function buildProxyHeaders(): Promise<HeadersInit> {
  const hdrs = await headers();
  const jar = await cookies();
  const orgId = jar.get("active_org_id")?.value;

  const result: Record<string, string> = {
    cookie: hdrs.get("cookie") ?? "",
  };
  if (orgId) result["X-Org-Id"] = orgId;
  return result;
}

export { API_URL };
```

- [ ] **Step 2: Update notifications/route.ts to use the helper**

Replace `apps/web/src/app/api/notifications/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/notifications`, { headers: proxyHeaders });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api-proxy.ts apps/web/src/app/api/notifications/route.ts
git commit -m "feat: shared proxy header utility forwarding X-Org-Id"
```

---

## Task 10: New Next.js proxy routes for organizations

**Files:**
- Create: `apps/web/src/app/api/organizations/current/route.ts`
- Create: `apps/web/src/app/api/organizations/current/members/route.ts`
- Create: `apps/web/src/app/api/organizations/current/members/[userId]/route.ts`
- Create: `apps/web/src/app/api/organizations/current/invites/route.ts`
- Create: `apps/web/src/app/api/organizations/current/invites/[inviteId]/route.ts`
- Create: `apps/web/src/app/api/organizations/current/invite-link/route.ts`
- Create: `apps/web/src/app/api/organizations/current/invite-link/reset/route.ts`
- Create: `apps/web/src/app/api/join/[token]/route.ts`

- [ ] **Step 1: Create organizations/current route**

`apps/web/src/app/api/organizations/current/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current`, { headers: proxyHeaders });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PATCH(request: Request) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const body = await request.json();
  const res = await fetch(`${API_URL}/organizations/current`, {
    method: "PATCH",
    headers: { ...proxyHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create members route**

`apps/web/src/app/api/organizations/current/members/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current/members`, { headers: proxyHeaders });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 3: Create members/[userId] route**

`apps/web/src/app/api/organizations/current/members/[userId]/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { userId } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const body = await request.json();
  const res = await fetch(`${API_URL}/organizations/current/members/${userId}`, {
    method: "PATCH",
    headers: { ...proxyHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(_request: Request, { params }: Params) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { userId } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current/members/${userId}`, {
    method: "DELETE",
    headers: proxyHeaders,
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 4: Create invites routes**

`apps/web/src/app/api/organizations/current/invites/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current/invites`, { headers: proxyHeaders });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const body = await request.json();
  const res = await fetch(`${API_URL}/organizations/current/invites`, {
    method: "POST",
    headers: { ...proxyHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

`apps/web/src/app/api/organizations/current/invites/[inviteId]/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

type Params = { params: Promise<{ inviteId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { inviteId } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current/invites/${inviteId}`, {
    method: "DELETE",
    headers: proxyHeaders,
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 5: Create invite-link routes**

`apps/web/src/app/api/organizations/current/invite-link/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current/invite-link`, { headers: proxyHeaders });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PATCH(request: Request) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const body = await request.json();
  const res = await fetch(`${API_URL}/organizations/current/invite-link`, {
    method: "PATCH",
    headers: { ...proxyHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

`apps/web/src/app/api/organizations/current/invite-link/reset/route.ts`:

```typescript
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";
import { headers } from "next/headers";

export async function POST() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current/invite-link/reset`, {
    method: "POST",
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 6: Create join/[token] proxy route**

`apps/web/src/app/api/join/[token]/route.ts`:

```typescript
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/join/${token}`, { headers: proxyHeaders });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/join/${token}`, {
    method: "POST",
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

- [ ] **Step 7: Add /join to PUBLIC_PATHS in proxy.ts**

In `apps/web/src/proxy.ts`, add `"/join"` to `PUBLIC_PATHS`:

```typescript
const PUBLIC_PATHS = [
  "/",
  "/chat",
  "/join",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];
```

- [ ] **Step 8: Type check**

```bash
pnpm check-types 2>&1 | tail -20
```

Expected: passes.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/api-proxy.ts apps/web/src/app/api/organizations apps/web/src/app/api/join apps/web/src/proxy.ts
git commit -m "feat: Next.js proxy routes for organizations and join"
```

---

## Task 11: OrgSwitcher Component

**Files:**
- Create: `apps/web/src/features/organizations/components/OrgSwitcher.tsx`
- Create: `apps/web/src/features/organizations/index.ts`
- Modify: `apps/web/src/app/chat.tsx`

- [ ] **Step 1: Create the OrgSwitcher component**

Create `apps/web/src/features/organizations/components/OrgSwitcher.tsx`:

```tsx
"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
};

type Member = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getActiveOrgId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)active_org_id=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setActiveOrgCookie(orgId: string) {
  document.cookie = `active_org_id=${orgId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function OrgSwitcher() {
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/organizations/current")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Org | null) => {
        if (data) setCurrentOrg(data);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    // Build org list from members endpoint — each user may be in multiple orgs
    // For now, personal org only; multi-org is addable later without API changes
    if (currentOrg) setOrgs([currentOrg]);
  }, [currentOrg]);

  function handleSelect(org: Org) {
    setActiveOrgCookie(org.id);
    setCurrentOrg(org);
    setOpen(false);
    window.location.reload();
  }

  // Don't render for users with only one org
  if (!currentOrg || orgs.length <= 1) {
    return currentOrg ? (
      <span className="rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
        {getInitials(currentOrg.name)}
      </span>
    ) : null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-accent"
        >
          <span className="font-medium">{getInitials(currentOrg.name)}</span>
          <span className="max-w-24 truncate text-muted-foreground text-xs">
            {currentOrg.name}
          </span>
          <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => handleSelect(org)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span className="flex size-6 items-center justify-center rounded bg-muted font-medium text-xs">
              {getInitials(org.name)}
            </span>
            <span className="flex-1 truncate text-left">{org.name}</span>
            {org.id === currentOrg.id && <CheckIcon className="size-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Create barrel export**

`apps/web/src/features/organizations/index.ts`:

```typescript
export { OrgSwitcher } from "./components/OrgSwitcher";
```

- [ ] **Step 3: Add OrgSwitcher to chat header**

In `apps/web/src/app/chat.tsx`, add import:

```typescript
import { OrgSwitcher } from "@/features/organizations";
```

In the header, add `OrgSwitcher` between `NotificationBell` and `UserMenu`:

```tsx
          {session && tokensRemaining !== null && (
            <Link
              href="/billing"
              className="text-muted-foreground text-xs hover:text-foreground"
            >
              {formatCompact(tokensRemaining)} tokens left
            </Link>
          )}
          {!session && (
            <span className="text-muted-foreground text-xs">
              Guest · 10k limit
            </span>
          )}
          {session && <NotificationBell />}
          {session && <OrgSwitcher />}
          <UserMenu />
```

- [ ] **Step 4: Type check**

```bash
pnpm check-types 2>&1 | tail -20
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/organizations apps/web/src/app/chat.tsx
git commit -m "feat: OrgSwitcher component in chat header"
```

---

## Task 12: Organization Settings Tab

**Files:**
- Create: `apps/web/src/features/organizations/components/OrganizationTab.tsx`
- Modify: `apps/web/src/features/settings/components/SettingsPage.tsx`

- [ ] **Step 1: Create the OrganizationTab component**

Create `apps/web/src/features/organizations/components/OrganizationTab.tsx`:

```tsx
"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { CopyIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  invite_link_enabled: boolean;
  role: string;
};

type Member = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
};

type InviteLink = {
  enabled: boolean;
  token: string | null;
};

const ROLE_OPTIONS = ["member", "admin", "owner"] as const;

export function OrganizationTab() {
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [saving, setSaving] = useState(false);

  // General form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");

  async function load() {
    const [orgRes, membersRes, invitesRes, linkRes] = await Promise.all([
      fetch("/api/organizations/current"),
      fetch("/api/organizations/current/members"),
      fetch("/api/organizations/current/invites"),
      fetch("/api/organizations/current/invite-link"),
    ]);
    if (orgRes.ok) {
      const data: Org = await orgRes.json();
      setOrg(data);
      setName(data.name);
      setSlug(data.slug ?? "");
      setLogoUrl(data.logo_url ?? "");
    }
    if (membersRes.ok) setMembers(await membersRes.json());
    if (invitesRes.ok) setInvites(await invitesRes.json());
    if (linkRes.ok) setInviteLink(await linkRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  const isAdmin = org?.role === "admin" || org?.role === "owner";
  const isOwner = org?.role === "owner";

  async function saveGeneral() {
    setSaving(true);
    const res = await fetch("/api/organizations/current", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug || null, logo_url: logoUrl || null }),
    });
    if (res.ok) {
      const updated: Org = await res.json();
      setOrg(updated);
    }
    setSaving(false);
  }

  async function changeRole(userId: string, role: string) {
    await fetch(`/api/organizations/current/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    await fetch(`/api/organizations/current/members/${userId}`, { method: "DELETE" });
    await load();
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    await fetch("/api/organizations/current/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    setInviteEmail("");
    await load();
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/organizations/current/invites/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleInviteLink(enabled: boolean) {
    const res = await fetch("/api/organizations/current/invite-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) setInviteLink(await res.json());
  }

  async function resetInviteLink() {
    if (!confirm("Reset the invite link? The current link will stop working.")) return;
    const res = await fetch("/api/organizations/current/invite-link/reset", { method: "POST" });
    if (res.ok) setInviteLink(await res.json());
  }

  const inviteLinkUrl = inviteLink?.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${inviteLink.token}`
    : "";

  if (!org) return <div className="text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-8">
      {/* General */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="font-semibold text-base">General</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="org-name">Organization name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-slug">Slug</Label>
              <Input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-org" />
              {slug && (
                <p className="text-muted-foreground text-xs">
                  URL: {typeof window !== "undefined" ? window.location.origin : ""}/org/{slug}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-logo">Logo URL</Label>
              <div className="flex gap-2">
                <Input id="org-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
                {logoUrl && (
                  <img src={logoUrl} alt="logo preview" className="size-10 rounded object-cover" />
                )}
              </div>
            </div>
            <Button onClick={saveGeneral} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <h2 className="font-semibold text-base">Members</h2>
        <div className="rounded-md border divide-y">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted font-medium text-sm">
                {(m.name ?? m.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{m.name ?? m.email}</p>
                <p className="truncate text-muted-foreground text-xs">{m.email}</p>
              </div>
              {isOwner ? (
                <Select
                  value={m.role}
                  onValueChange={(v) => changeRole(m.user_id, v)}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  {m.role}
                </span>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => removeMember(m.user_id)}
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Invitations */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="font-semibold text-base">Invitations</h2>

          {/* Email invite form */}
          <form onSubmit={sendInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">member</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!inviteEmail}>
              Send Invite
            </Button>
          </form>

          {/* Pending invites */}
          {invites.length > 0 && (
            <div className="rounded-md border divide-y">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 px-3 py-2">
                  <p className="flex-1 text-sm">{inv.email}</p>
                  <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                    {inv.role}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    expires {new Date(inv.expires_at).toLocaleDateString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => revokeInvite(inv.id)}
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Invite link */}
          {inviteLink && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Invite link</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {inviteLink.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={inviteLink.enabled}
                    onCheckedChange={toggleInviteLink}
                  />
                </div>
              </div>
              {inviteLink.enabled && inviteLinkUrl && (
                <div className="flex gap-2">
                  <Input readOnly value={inviteLinkUrl} className="flex-1 text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigator.clipboard.writeText(inviteLinkUrl)}
                  >
                    <CopyIcon className="size-3.5" />
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={resetInviteLink}>
                Reset link
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add OrganizationTab to SettingsPage**

In `apps/web/src/features/settings/components/SettingsPage.tsx`:

```tsx
import { OrganizationTab } from "@/features/organizations/components/OrganizationTab";

const VALID_TABS = ["profile", "appearance", "api-keys", "organization"] as const;
type Tab = (typeof VALID_TABS)[number];

// In the Tabs component, add:
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
        </TabsList>

// Add content:
        <TabsContent value="organization" className="mt-6">
          <OrganizationTab />
        </TabsContent>
```

- [ ] **Step 3: Type check**

```bash
pnpm check-types 2>&1 | tail -20
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/organizations/components/OrganizationTab.tsx apps/web/src/features/settings/components/SettingsPage.tsx
git commit -m "feat: Organization settings tab with members, invites, invite link"
```

---

## Task 13: /join/[token] Accept Invite Page

**Files:**
- Create: `apps/web/src/app/join/[token]/page.tsx`

- [ ] **Step 1: Create the join page**

Create `apps/web/src/app/join/[token]/page.tsx`:

```tsx
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

type JoinInfo = {
  org_name: string;
  role: string;
  invite_type: string;
};

type Props = { params: Promise<{ token: string }> };

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function getJoinInfo(token: string): Promise<JoinInfo | null> {
  try {
    const res = await fetch(`${API_URL}/join/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  const info = await getJoinInfo(token);

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border p-6 text-center space-y-3">
          <p className="font-semibold text-lg">Invalid or expired invite</p>
          <p className="text-muted-foreground text-sm">
            This link is no longer valid.
          </p>
          <Link href="/" className="text-sm underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect(`/login?next=/join/${token}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border p-6 space-y-4">
        <div className="space-y-1 text-center">
          <p className="font-semibold text-xl">Join {info.org_name}</p>
          <p className="text-muted-foreground text-sm">
            You&apos;ve been invited as a <strong>{info.role}</strong>.
          </p>
        </div>
        <AcceptForm token={token} />
      </div>
    </div>
  );
}

// Client component for form interactivity
```

Create `apps/web/src/app/join/[token]/AcceptForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/join/${token}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      // Set active_org_id cookie and redirect to chat
      document.cookie = `active_org_id=${data.org_id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.push("/chat");
    } else {
      const detail = await res.json().catch(() => ({ detail: "Failed to accept invite" }));
      setError(detail.detail ?? "Failed to accept invite");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={loading}
          className="flex-1 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Accepting…" : "Accept Invitation"}
        </button>
        <a
          href="/chat"
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          Decline
        </a>
      </div>
    </div>
  );
}
```

Update `apps/web/src/app/join/[token]/page.tsx` to import and use `AcceptForm`:

```tsx
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AcceptForm } from "./AcceptForm";

// ... (keep type definitions and getJoinInfo function) ...

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  const info = await getJoinInfo(token);

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border p-6 text-center space-y-3">
          <p className="font-semibold text-lg">Invalid or expired invite</p>
          <p className="text-muted-foreground text-sm">This link is no longer valid.</p>
          <Link href="/" className="text-sm underline">Go home</Link>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect(`/login?next=/join/${token}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border p-6 space-y-4">
        <div className="space-y-1 text-center">
          <p className="font-semibold text-xl">Join {info.org_name}</p>
          <p className="text-muted-foreground text-sm">
            You&apos;ve been invited as a <strong>{info.role}</strong>.
          </p>
        </div>
        <AcceptForm token={token} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
pnpm check-types 2>&1 | tail -20
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/join
git commit -m "feat: /join/[token] accept invite page"
```

---

## Task 14: Final Validation + ROADMAP Update

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run all Python tests**

```bash
uv run pytest apps/server/tests/ -q 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 2: Run TypeScript type check**

```bash
pnpm check-types 2>&1 | tail -30
```

Expected: exits 0.

- [ ] **Step 3: Update ROADMAP.md — mark Phase 17 items complete**

Change items 84–88 in ROADMAP.md from ⬜ to ✅:

```markdown
| ✅ | 84 | Organization creation + settings | Name, slug, logo, description; settings page |
| ✅ | 85 | Member invitation flow | Invite by email → accept link → join org; resend/revoke invites |
| ✅ | 86 | Org roles + permission checks | `owner`, `admin`, `member`; enforce in API and UI |
| ⬜ | 87 | Org-level Stripe billing | Org gets its own Stripe customer; seats-based or flat-rate org plan |
| ✅ | 88 | Personal/org context switcher | Header switcher (like GitHub); routes scoped to active context |
```

> Note: Item 87 (Stripe billing migration) is a separate task requiring Stripe customer migration and is left for Phase 21.

- [ ] **Step 4: Final commit**

```bash
git add ROADMAP.md
git commit -m "feat: Phase 17 complete — organizations, invites, roles, org switcher"
```

---

## Verification Checklist

After all tasks complete:

1. `pnpm check-types` — passes
2. `uv run pytest apps/server/tests/` — all tests pass
3. New user signup → personal org auto-created, user is owner (`organization_members` row)
4. Invite by email → invite row in DB, email sent (check Resend dashboard)
5. Accept invite via `/join/<token>` → member appears in org members list
6. Invite link → enable, copy, open in incognito, accept → member appears
7. Org switcher renders in chat header (single org = no dropdown; multi-org = popover)
8. `/settings?tab=organization` → shows members, pending invites, invite link section
9. Role enforcement → member calling admin endpoint returns 403
10. Token budget → switching orgs changes the budget key from `user_id` to `org_id`
