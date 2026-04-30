# Admin Dashboard (Phase 16a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent admin sidebar, ag-grid DataGrid component, and user/tenant management pages with ban, delete, reset-password, and plan-override actions.

**Architecture:** DataGrid added to `@repo/ui` as a path export (`@repo/ui/components/data-grid`) following the maintenance-app pattern. Two new FastAPI routers (`admin_users`, `admin_tenants`) gated by RBAC permissions. New Next.js admin layout with sidebar wrapping all `/admin/*` routes. Modal dialogs for row actions.

**Tech Stack:** ag-grid-community 35.2.0, ag-grid-react 35.2.0, themeQuartz (CSS-var bridging), shadcn Dialog, FastAPI + asyncpg, better-auth `requestPasswordReset`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/db/migrations/0004_user_banned.sql` | Create | SQL migration — add `banned` column |
| `packages/db/src/schema/auth.ts` | Modify | Add `banned` to Drizzle user table |
| `packages/db/src/migrate.ts` | Modify | Add `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned"` |
| `packages/ui/package.json` | Modify | Add ag-grid dependencies |
| `packages/ui/src/components/data-grid.tsx` | Create | Shared DataGrid component with CSS-var theme |
| `apps/server/src/api/auth/deps.py` | Modify | Add `banned` to SELECT; raise 401 if banned |
| `apps/server/src/api/routers/admin_users.py` | Create | GET /admin/users, POST ban/unban, DELETE, POST reset-password (N/A — handled in Next.js) |
| `apps/server/src/api/routers/admin_tenants.py` | Create | GET /admin/tenants, PATCH /{id} |
| `apps/server/src/api/main.py` | Modify | Register two new routers |
| `apps/server/tests/test_auth_banned.py` | Create | Test banned check in get_current_user |
| `apps/server/tests/test_admin_users.py` | Create | Test admin_users router |
| `apps/server/tests/test_admin_tenants.py` | Create | Test admin_tenants router |
| `apps/web/src/app/admin/layout.tsx` | Create | Sidebar layout wrapping all /admin/* |
| `apps/web/src/features/admin/components/AdminNav.tsx` | Create | Client nav with active-link detection |
| `apps/web/src/app/api/admin/users/[...path]/route.ts` | Create | Users proxy (isAdmin gate + reset-password intercept) |
| `apps/web/src/app/api/admin/tenants/[...path]/route.ts` | Create | Tenants proxy (isAdmin gate) |
| `apps/web/src/app/admin/users/page.tsx` | Create | /admin/users page |
| `apps/web/src/app/admin/tenants/page.tsx` | Create | /admin/tenants page |
| `apps/web/src/features/admin/components/UsersPage.tsx` | Create | Users DataGrid + search |
| `apps/web/src/features/admin/components/UserDetailModal.tsx` | Create | Ban/unban, reset password, delete modal |
| `apps/web/src/features/admin/components/TenantsPage.tsx` | Create | Tenants DataGrid |
| `apps/web/src/features/admin/components/TenantEditModal.tsx` | Create | Plan/limit edit modal |

---

## Task 1: DB Migration — `banned` column

**Files:**
- Create: `packages/db/migrations/0004_user_banned.sql`
- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/migrate.ts`

- [ ] **Step 1: Create the SQL migration file**

```sql
-- packages/db/migrations/0004_user_banned.sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Add `banned` to the Drizzle auth schema**

In `packages/db/src/schema/auth.ts`, add after the `isAdmin` line:

```typescript
  isAdmin: boolean("isAdmin").default(false).notNull(),
  banned: boolean("banned").default(false).notNull(),
```

- [ ] **Step 3: Add the ALTER TABLE to migrate.ts**

In `packages/db/src/migrate.ts`, add after the last `await db.execute(...)` call (the one that adds `"isAdmin"`):

```typescript
  await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE`);
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @repo/db check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0004_user_banned.sql packages/db/src/schema/auth.ts packages/db/src/migrate.ts
git commit -m "feat: add banned column to user table"
```

---

## Task 2: FastAPI — banned check in `get_current_user`

**Files:**
- Modify: `apps/server/src/api/auth/deps.py`
- Create: `apps/server/tests/test_auth_banned.py`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/test_auth_banned.py`:

```python
"""Tests for banned-user enforcement in get_current_user."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from api.auth.deps import get_current_user
from fastapi import FastAPI, HTTPException, Request


@pytest.mark.asyncio
async def test_banned_user_raises_401():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-1",
            "email": "banned@example.com",
            "name": "Banned",
            "image": None,
            "emailVerified": True,
            "banned": True,
        }
    )
    pool.fetch = AsyncMock(return_value=[])

    app = FastAPI()
    app.state.db_pool = pool

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", b"better-auth.session_token=tok.sig")],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(request, None)

    assert exc_info.value.status_code == 401
    assert "suspended" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_active_user_passes_banned_check():
    pool = AsyncMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "id": "user-2",
            "email": "active@example.com",
            "name": "Active",
            "image": None,
            "emailVerified": True,
            "banned": False,
        }
    )
    pool.fetch = AsyncMock(return_value=[])

    app = FastAPI()
    app.state.db_pool = pool

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", b"better-auth.session_token=tok.sig")],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    user = await get_current_user(request, None)
    assert user.id == "user-2"
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/server && uv run pytest tests/test_auth_banned.py -v
```

Expected: FAIL — `banned` key missing from mock row / no banned check yet.

- [ ] **Step 3: Update `deps.py` — add `banned` to SELECT and check it**

Replace the session query and add the banned check. The full updated `get_current_user` function in `apps/server/src/api/auth/deps.py`:

```python
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

    return AuthUser(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        image=row["image"],
        email_verified=row["emailVerified"],
        permissions=frozenset(r["id"] for r in perm_rows),
    )
```

- [ ] **Step 4: Run tests — all must pass**

```bash
cd apps/server && uv run pytest tests/test_auth_banned.py tests/test_rbac_permissions.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/api/auth/deps.py apps/server/tests/test_auth_banned.py
git commit -m "feat: reject banned users in get_current_user"
```

---

## Task 3: FastAPI — `admin_users` router

**Files:**
- Create: `apps/server/src/api/routers/admin_users.py`
- Modify: `apps/server/src/api/main.py`
- Create: `apps/server/tests/test_admin_users.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/tests/test_admin_users.py`:

```python
"""Tests for the admin users router."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.rbac.permissions import Permission
from api.routers.admin_users import router
from fastapi import FastAPI
from fastapi.testclient import TestClient

MOCK_USER_ROW = {
    "id": "user-1",
    "email": "test@example.com",
    "name": "Test User",
    "is_admin": False,
    "banned": False,
    "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
    "plan": "free",
    "token_limit": 100000,
    "tokens_used": 5000,
}


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(router)
    return a


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


def admin_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset([
                Permission.ADMIN_USERS_READ,
                Permission.ADMIN_USERS_WRITE,
            ]),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def unprivileged_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


# ── permission enforcement ────────────────────────────────────────────────────


def test_list_users_requires_permission(app, mock_pool):
    client = unprivileged_client(app, mock_pool)
    resp = client.get("/admin/users")
    assert resp.status_code == 403


# ── list users ────────────────────────────────────────────────────────────────


def test_list_users_returns_list(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[MOCK_USER_ROW])
    client = admin_client(app, mock_pool)
    resp = client.get("/admin/users")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["email"] == "test@example.com"
    assert data[0]["tokens_used"] == 5000


def test_list_users_passes_search_param(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[])
    client = admin_client(app, mock_pool)
    resp = client.get("/admin/users?search=alice")
    assert resp.status_code == 200
    call_sql = mock_pool.fetch.call_args[0][0]
    assert "ILIKE" in call_sql


# ── ban / unban ───────────────────────────────────────────────────────────────


def test_ban_user(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.post("/admin/users/user-1/ban")
    assert resp.status_code == 200
    assert resp.json()["banned"] is True
    call_sql = mock_pool.execute.call_args[0][0]
    assert "banned" in call_sql


def test_unban_user(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.post("/admin/users/user-1/unban")
    assert resp.status_code == 200
    assert resp.json()["banned"] is False


# ── delete ────────────────────────────────────────────────────────────────────


def test_delete_user(app, mock_pool):
    client = admin_client(app, mock_pool)
    resp = client.delete("/admin/users/user-1")
    assert resp.status_code == 204
    call_sql = mock_pool.execute.call_args[0][0]
    assert "DELETE FROM" in call_sql
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/server && uv run pytest tests/test_admin_users.py -v
```

Expected: ERROR — `api.routers.admin_users` not found.

- [ ] **Step 3: Create `apps/server/src/api/routers/admin_users.py`**

```python
"""Admin router — user management (list, ban, unban, delete)."""

from __future__ import annotations

from datetime import datetime

import asyncpg
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..rbac import Permission, require_permission

log = structlog.get_logger()
router = APIRouter(prefix="/admin/users", tags=["admin"])

_BASE_QUERY = """
    SELECT
        u.id,
        u.email,
        u.name,
        u."isAdmin"    AS is_admin,
        u.banned,
        u."createdAt"  AS created_at,
        t.plan,
        t."tokenLimit" AS token_limit,
        COALESCE(stu.tokens_used, 0)::int AS tokens_used
    FROM "user" u
    LEFT JOIN tenants t ON t.id = u.id
    LEFT JOIN (
        SELECT tenant_id, SUM(tokens) AS tokens_used
        FROM session_token_usage
        WHERE date_trunc('month', recorded_at) = date_trunc('month', NOW())
        GROUP BY tenant_id
    ) stu ON stu.tenant_id = u.id
"""


class AdminUserOut(BaseModel):
    id: str
    email: str
    name: str | None
    is_admin: bool
    banned: bool
    plan: str | None
    token_limit: int | None
    tokens_used: int
    created_at: datetime


def _row_to_user(row: asyncpg.Record) -> AdminUserOut:
    return AdminUserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        is_admin=row["is_admin"],
        banned=row["banned"],
        plan=row["plan"],
        token_limit=row["token_limit"],
        tokens_used=row["tokens_used"],
        created_at=row["created_at"],
    )


@router.get(
    "",
    response_model=list[AdminUserOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_users(request: Request, search: str = "") -> list[AdminUserOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    if search:
        rows = await pool.fetch(
            _BASE_QUERY
            + ' WHERE u.email ILIKE $1 OR u.name ILIKE $1 ORDER BY u."createdAt" DESC LIMIT 100',
            f"%{search}%",
        )
    else:
        rows = await pool.fetch(
            _BASE_QUERY + ' ORDER BY u."createdAt" DESC LIMIT 100',
        )
    return [_row_to_user(r) for r in rows]


@router.post(
    "/{user_id}/ban",
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def ban_user(user_id: str, request: Request) -> dict:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute('UPDATE "user" SET banned = TRUE WHERE id = $1', user_id)
    log.info("admin.user.banned", user_id=user_id)
    return {"banned": True}


@router.post(
    "/{user_id}/unban",
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def unban_user(user_id: str, request: Request) -> dict:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute('UPDATE "user" SET banned = FALSE WHERE id = $1', user_id)
    log.info("admin.user.unbanned", user_id=user_id)
    return {"banned": False}


@router.delete(
    "/{user_id}",
    status_code=204,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def delete_user(user_id: str, request: Request) -> Response:
    pool: asyncpg.Pool = request.app.state.db_pool
    await pool.execute('DELETE FROM "user" WHERE id = $1', user_id)
    log.info("admin.user.deleted", user_id=user_id)
    return Response(status_code=204)
```

- [ ] **Step 4: Register the router in `apps/server/src/api/main.py`**

Change the import line from:
```python
from .routers import admin, auth, billing, chat, health, ingest, jobs, media, rbac
```
to:
```python
from .routers import admin, admin_users, admin_tenants, auth, billing, chat, health, ingest, jobs, media, rbac
```

And add after `app.include_router(admin.router)`:
```python
app.include_router(admin_users.router)
```

(Leave `admin_tenants` for Task 4 — add it then.)

- [ ] **Step 5: Run tests**

```bash
cd apps/server && uv run pytest tests/test_admin_users.py -v
```

Expected: 7 passed.

- [ ] **Step 6: Run full suite**

```bash
cd apps/server && uv run pytest -v
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/routers/admin_users.py apps/server/src/api/main.py apps/server/tests/test_admin_users.py
git commit -m "feat: add admin users router (list, ban, unban, delete)"
```

---

## Task 4: FastAPI — `admin_tenants` router

**Files:**
- Create: `apps/server/src/api/routers/admin_tenants.py`
- Modify: `apps/server/src/api/main.py`
- Create: `apps/server/tests/test_admin_tenants.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/tests/test_admin_tenants.py`:

```python
"""Tests for the admin tenants router."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from api.auth.deps import AuthUser, get_current_user
from api.rbac.permissions import Permission
from api.routers.admin_tenants import router
from fastapi import FastAPI
from fastapi.testclient import TestClient

MOCK_TENANT_ROW = {
    "id": "tenant-1",
    "email": "user@example.com",
    "name": "User One",
    "plan": "free",
    "token_limit": 100000,
    "tokens_used": 12000,
    "stripe_customer_id": None,
    "stripe_subscription_id": None,
    "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
}


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(router)
    return a


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    pool.execute = AsyncMock()
    return pool


def admin_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(
            id="admin-1",
            email="admin@example.com",
            permissions=frozenset([
                Permission.ADMIN_USERS_READ,
                Permission.ADMIN_USERS_WRITE,
            ]),
        )

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def unprivileged_client(app, mock_pool):
    app.state.db_pool = mock_pool

    def override():
        return AuthUser(id="user-1", email="user@example.com")

    app.dependency_overrides[get_current_user] = override
    return TestClient(app)


def test_list_tenants_requires_permission(app, mock_pool):
    client = unprivileged_client(app, mock_pool)
    resp = client.get("/admin/tenants")
    assert resp.status_code == 403


def test_list_tenants_returns_list(app, mock_pool):
    mock_pool.fetch = AsyncMock(return_value=[MOCK_TENANT_ROW])
    client = admin_client(app, mock_pool)
    resp = client.get("/admin/tenants")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["email"] == "user@example.com"
    assert data[0]["tokens_used"] == 12000


def test_patch_tenant_plan(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={**MOCK_TENANT_ROW, "plan": "pro", "token_limit": 2000000})
    client = admin_client(app, mock_pool)
    resp = client.patch("/admin/tenants/tenant-1", json={"plan": "pro", "token_limit": 2000000})
    assert resp.status_code == 200
    assert resp.json()["plan"] == "pro"
    assert mock_pool.execute.call_count >= 1


def test_patch_tenant_only_plan(app, mock_pool):
    mock_pool.fetchrow = AsyncMock(return_value={**MOCK_TENANT_ROW, "plan": "pro"})
    client = admin_client(app, mock_pool)
    resp = client.patch("/admin/tenants/tenant-1", json={"plan": "pro"})
    assert resp.status_code == 200
    call_sql = mock_pool.execute.call_args[0][0]
    assert "plan" in call_sql
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/server && uv run pytest tests/test_admin_tenants.py -v
```

Expected: ERROR — module not found.

- [ ] **Step 3: Create `apps/server/src/api/routers/admin_tenants.py`**

```python
"""Admin router — tenant management (list, patch plan/limits)."""

from __future__ import annotations

from datetime import datetime

import asyncpg
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..rbac import Permission, require_permission

log = structlog.get_logger()
router = APIRouter(prefix="/admin/tenants", tags=["admin"])

_BASE_QUERY = """
    SELECT
        t.id,
        u.email,
        u.name,
        t.plan,
        t."tokenLimit"           AS token_limit,
        t."stripeCustomerId"     AS stripe_customer_id,
        t."stripeSubscriptionId" AS stripe_subscription_id,
        t."createdAt"            AS created_at,
        COALESCE(stu.tokens_used, 0)::int AS tokens_used
    FROM tenants t
    JOIN "user" u ON u.id = t.id
    LEFT JOIN (
        SELECT tenant_id, SUM(tokens) AS tokens_used
        FROM session_token_usage
        WHERE date_trunc('month', recorded_at) = date_trunc('month', NOW())
        GROUP BY tenant_id
    ) stu ON stu.tenant_id = t.id
"""


class AdminTenantOut(BaseModel):
    id: str
    email: str
    name: str | None
    plan: str
    token_limit: int
    tokens_used: int
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    created_at: datetime


class PatchTenantIn(BaseModel):
    plan: str | None = None
    token_limit: int | None = None


def _row_to_tenant(row: asyncpg.Record) -> AdminTenantOut:
    return AdminTenantOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
        token_limit=row["token_limit"],
        tokens_used=row["tokens_used"],
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        created_at=row["created_at"],
    )


@router.get(
    "",
    response_model=list[AdminTenantOut],
    dependencies=[require_permission(Permission.ADMIN_USERS_READ)],
)
async def list_tenants(request: Request) -> list[AdminTenantOut]:
    pool: asyncpg.Pool = request.app.state.db_pool
    rows = await pool.fetch(_BASE_QUERY + ' ORDER BY t."createdAt" DESC LIMIT 200')
    return [_row_to_tenant(r) for r in rows]


@router.patch(
    "/{tenant_id}",
    response_model=AdminTenantOut,
    dependencies=[require_permission(Permission.ADMIN_USERS_WRITE)],
)
async def patch_tenant(tenant_id: str, body: PatchTenantIn, request: Request) -> AdminTenantOut:
    pool: asyncpg.Pool = request.app.state.db_pool
    if body.plan is not None:
        await pool.execute("UPDATE tenants SET plan = $1 WHERE id = $2", body.plan, tenant_id)
    if body.token_limit is not None:
        await pool.execute(
            'UPDATE tenants SET "tokenLimit" = $1 WHERE id = $2', body.token_limit, tenant_id
        )
    row = await pool.fetchrow(_BASE_QUERY + " WHERE t.id = $1", tenant_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    log.info("admin.tenant.patched", tenant_id=tenant_id, plan=body.plan)
    return _row_to_tenant(row)
```

- [ ] **Step 4: Register `admin_tenants` in `apps/server/src/api/main.py`**

After `app.include_router(admin_users.router)` add:
```python
app.include_router(admin_tenants.router)
```

- [ ] **Step 5: Run tests**

```bash
cd apps/server && uv run pytest tests/test_admin_tenants.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Run full suite**

```bash
cd apps/server && uv run pytest -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/routers/admin_tenants.py apps/server/src/api/main.py apps/server/tests/test_admin_tenants.py
git commit -m "feat: add admin tenants router (list, patch plan/token_limit)"
```

---

## Task 5: Shared DataGrid component in `@repo/ui`

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/components/data-grid.tsx`

- [ ] **Step 1: Add ag-grid dependencies to `packages/ui/package.json`**

In the `"dependencies"` section of `packages/ui/package.json`, add:

```json
"ag-grid-community": "35.2.0",
"ag-grid-react": "^35.2.0"
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Create `packages/ui/src/components/data-grid.tsx`**

```tsx
"use client";

import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type GridOptions,
  type Theme,
} from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";

export const aiNativeCoreGridTheme = themeQuartz.withParams({
  accentColor: "var(--primary)",
  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  borderColor: "var(--border)",
  borderWidth: 1,
  browserColorScheme: "inherit",
  chromeBackgroundColor: "var(--card)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--foreground)",
  headerFontWeight: 600,
  headerFontSize: 12,
  cellTextColor: "var(--foreground)",
  textColor: "var(--foreground)",
  subtleTextColor: "var(--muted-foreground)",
  dataFontSize: 14,
  fontFamily: [
    "var(--font-sans)",
    "ui-sans-serif",
    "system-ui",
    "sans-serif",
    "Apple Color Emoji",
    "Segoe UI Emoji",
  ],
  spacing: 8,
  rowHoverColor: "color-mix(in oklch, var(--muted) 50%, transparent)",
  oddRowBackgroundColor: "color-mix(in oklch, var(--muted) 12%, var(--background))",
  selectedRowBackgroundColor: "color-mix(in oklch, var(--primary) 14%, var(--background))",
});

const modules = [AllCommunityModule];

export type DataGridProps<TData = unknown> = Omit<
  GridOptions<TData>,
  "rowData" | "columnDefs" | "theme"
> & {
  rowData: TData[] | null | undefined;
  columnDefs: ColDef<TData>[];
  theme?: Theme;
  className?: string;
  height?: number | string;
};

export function DataGrid<TData = unknown>({
  rowData,
  columnDefs,
  theme = aiNativeCoreGridTheme,
  className,
  height = 480,
  defaultColDef,
  pagination = true,
  paginationPageSize = 25,
  paginationPageSizeSelector = [10, 25, 50, 100],
  ...gridOptions
}: DataGridProps<TData>) {
  return (
    <AgGridProvider modules={modules}>
      <div className={className} style={{ height }}>
        <AgGridReact<TData>
          theme={theme}
          rowData={rowData ?? []}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef ?? { sortable: true, resizable: true }}
          pagination={pagination}
          paginationPageSize={paginationPageSize}
          paginationPageSizeSelector={paginationPageSizeSelector}
          {...gridOptions}
        />
      </div>
    </AgGridProvider>
  );
}
```

- [ ] **Step 4: Type-check the UI package**

```bash
pnpm --filter @repo/ui check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json packages/ui/src/components/data-grid.tsx pnpm-lock.yaml
git commit -m "feat: add DataGrid component to @repo/ui (ag-grid 35, CSS-var theme)"
```

---

## Task 6: Admin sidebar layout

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/features/admin/components/AdminNav.tsx`

- [ ] **Step 1: Create `apps/web/src/features/admin/components/AdminNav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Users", href: "/admin/users" },
  { label: "Tenants", href: "/admin/tenants" },
  { label: "RBAC", href: "/admin/rbac" },
  { label: "AI Config", href: "/admin" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="w-48 shrink-0 border-r bg-muted/30 p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Admin
      </p>
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ label, href }) => (
          <li key={href}>
            <Link
              href={href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive(href, pathname)
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/app/admin/layout.tsx`**

```tsx
import { AdminNav } from "@/features/admin/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx apps/web/src/features/admin/components/AdminNav.tsx
git commit -m "feat: add admin sidebar layout with persistent nav"
```

---

## Task 7: Next.js proxy routes for admin users and tenants

**Files:**
- Create: `apps/web/src/app/api/admin/users/[...path]/route.ts`
- Create: `apps/web/src/app/api/admin/tenants/[...path]/route.ts`

- [ ] **Step 1: Create `apps/web/src/app/api/admin/users/[...path]/route.ts`**

This route intercepts `reset-password` calls and handles them in Next.js; everything else is forwarded to FastAPI.

```ts
import { auth } from "@/auth";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user.isAdmin) return new Response("Forbidden", { status: 403 });

  // Reset-password is handled here — calls better-auth directly
  if (req.method === "POST" && path.at(-1) === "reset-password") {
    const body = await req.json() as { email: string };
    await auth.api.requestPasswordReset({
      body: { email: body.email, redirectTo: "/reset-password" },
      headers: hdrs,
    });
    return new Response(null, { status: 204 });
  }

  const url = `${API_URL}/admin/users/${path.join("/")}${req.nextUrl.search}`;
  const res = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      cookie: hdrs.get("cookie") ?? "",
    },
    body:
      req.method !== "GET" && req.method !== "DELETE"
        ? await req.text()
        : undefined,
  });

  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/admin/tenants/[...path]/route.ts`**

```ts
import { auth } from "@/auth";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user.isAdmin) return new Response("Forbidden", { status: 403 });

  const url = `${API_URL}/admin/tenants/${path.join("/")}${req.nextUrl.search}`;
  const res = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      cookie: hdrs.get("cookie") ?? "",
    },
    body:
      req.method !== "GET" && req.method !== "DELETE"
        ? await req.text()
        : undefined,
  });

  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/admin/users apps/web/src/app/api/admin/tenants
git commit -m "feat: add admin users and tenants proxy routes"
```

---

## Task 8: Users admin page

**Files:**
- Create: `apps/web/src/features/admin/components/UsersPage.tsx`
- Create: `apps/web/src/features/admin/components/UserDetailModal.tsx`
- Create: `apps/web/src/app/admin/users/page.tsx`

- [ ] **Step 1: Create `apps/web/src/features/admin/components/UserDetailModal.tsx`**

```tsx
"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  banned: boolean;
  plan: string | null;
  token_limit: number | null;
  tokens_used: number;
  created_at: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function UserDetailModal({
  user,
  onClose,
  onUpdated,
  onDeleted,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onUpdated: (u: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  if (!user) return null;

  async function handleBanToggle() {
    if (!user) return;
    setLoading("ban");
    setError("");
    try {
      const action = user.banned ? "unban" : "ban";
      const res = await fetch(`/api/admin/users/${user.id}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      onUpdated({ ...user, banned: !user.banned });
    } catch {
      setError("Action failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleResetPassword() {
    if (!user) return;
    setLoading("reset");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResetSent(true);
    } catch {
      setError("Failed to send reset email.");
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!user || deleteInput !== user.email) return;
    setLoading("delete");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      onDeleted(user.id);
      onClose();
    } catch {
      setError("Delete failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{user.email}</DialogTitle>
          {user.name && <p className="text-muted-foreground text-sm">{user.name}</p>}
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <div className="flex gap-4">
            <span className="text-muted-foreground">Plan</span>
            <span>{user.plan ?? "—"}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-muted-foreground">Usage</span>
            <span>
              {fmt(user.tokens_used)} / {user.token_limit ? fmt(user.token_limit) : "—"} tokens
            </span>
          </div>
          <div className="flex gap-4">
            <span className="text-muted-foreground">Joined</span>
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-muted-foreground">Status</span>
            <span className={user.banned ? "text-destructive" : "text-green-600"}>
              {user.banned ? "banned" : "active"}
            </span>
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!!loading}
            onClick={handleBanToggle}
          >
            {loading === "ban" ? "…" : user.banned ? "Unban user" : "Ban user"}
          </Button>

          {resetSent ? (
            <p className="text-center text-sm text-green-600">Reset email sent.</p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!!loading}
              onClick={handleResetPassword}
            >
              {loading === "reset" ? "Sending…" : "Send password reset email"}
            </Button>
          )}

          {!confirmDelete ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setConfirmDelete(true)}
            >
              Delete user
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-destructive p-3">
              <p className="text-sm text-destructive">
                Type <strong>{user.email}</strong> to confirm deletion:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-destructive"
                placeholder={user.email}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={deleteInput !== user.email || loading === "delete"}
                  onClick={handleDelete}
                >
                  {loading === "delete" ? "Deleting…" : "Confirm delete"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setConfirmDelete(false); setDeleteInput(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/features/admin/components/UsersPage.tsx`**

```tsx
"use client";

import { DataGrid } from "@repo/ui/components/data-grid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserDetailModal } from "./UserDetailModal";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  banned: boolean;
  plan: string | null;
  token_limit: number | null;
  tokens_used: number;
  created_at: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const COLUMN_DEFS: ColDef<AdminUser>[] = [
  { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
  { field: "name", headerName: "Name", width: 140 },
  {
    field: "plan",
    headerName: "Plan",
    width: 90,
    cellRenderer: (p: ICellRendererParams<AdminUser>) => {
      const plan = p.data?.plan;
      if (!plan) return <span className="text-muted-foreground">—</span>;
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            plan === "pro"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {plan}
        </span>
      );
    },
  },
  {
    colId: "usage",
    headerName: "Usage",
    width: 140,
    cellRenderer: (p: ICellRendererParams<AdminUser>) => {
      const u = p.data;
      if (!u) return null;
      const pct = u.token_limit ? Math.min((u.tokens_used / u.token_limit) * 100, 100) : 0;
      return (
        <div className="space-y-0.5 py-1">
          <p className="text-xs">{fmt(u.tokens_used)} / {u.token_limit ? fmt(u.token_limit) : "—"}</p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    },
  },
  {
    field: "is_admin",
    headerName: "Admin",
    width: 70,
    cellRenderer: (p: ICellRendererParams<AdminUser>) =>
      p.data?.is_admin ? (
        <span className="text-xs font-medium text-primary">✓</span>
      ) : null,
  },
  {
    field: "banned",
    headerName: "Status",
    width: 90,
    cellRenderer: (p: ICellRendererParams<AdminUser>) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          p.data?.banned
            ? "bg-destructive/10 text-destructive"
            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        }`}
      >
        {p.data?.banned ? "banned" : "active"}
      </span>
    ),
  },
  {
    field: "created_at",
    headerName: "Joined",
    width: 110,
    cellRenderer: (p: ICellRendererParams<AdminUser>) =>
      p.data ? new Date(p.data.created_at).toLocaleDateString() : null,
  },
];

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback((q: string) => {
    setLoading(true);
    const qs = q ? `?search=${encodeURIComponent(q)}` : "";
    fetch(`/api/admin/users${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: AdminUser[]) => setUsers(data))
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers("");
  }, [fetchUsers]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(q), 300);
  }

  function handleUpdated(updated: AdminUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelected(updated);
  }

  function handleDeleted(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setSelected(null);
  }

  return (
    <div className="space-y-4 p-8">
      <div>
        <h1 className="font-semibold text-2xl">Users</h1>
        <p className="text-muted-foreground text-sm">Manage user accounts</p>
      </div>

      <input
        type="search"
        value={search}
        onChange={handleSearchChange}
        placeholder="Search by email or name…"
        className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataGrid<AdminUser>
        rowData={loading ? null : users}
        columnDefs={COLUMN_DEFS}
        height={520}
        loading={loading}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => { if (e.data) setSelected(e.data); }}
        overlayNoRowsTemplate="No users found."
        defaultColDef={{ sortable: true, resizable: true }}
      />

      <UserDetailModal
        user={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the page route**

Create `apps/web/src/app/admin/users/page.tsx`:

```tsx
import { UsersPage } from "@/features/admin/components/UsersPage";

export default function Page() {
  return <UsersPage />;
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/admin/components/UsersPage.tsx apps/web/src/features/admin/components/UserDetailModal.tsx apps/web/src/app/admin/users/page.tsx
git commit -m "feat: add admin users page with DataGrid and action modal"
```

---

## Task 9: Tenants admin page

**Files:**
- Create: `apps/web/src/features/admin/components/TenantsPage.tsx`
- Create: `apps/web/src/features/admin/components/TenantEditModal.tsx`
- Create: `apps/web/src/app/admin/tenants/page.tsx`

- [ ] **Step 1: Create `apps/web/src/features/admin/components/TenantEditModal.tsx`**

```tsx
"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { useState } from "react";

type AdminTenant = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  token_limit: number;
  tokens_used: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function TenantEditModal({
  tenant,
  onClose,
  onUpdated,
}: {
  tenant: AdminTenant | null;
  onClose: () => void;
  onUpdated: (t: AdminTenant) => void;
}) {
  const [plan, setPlan] = useState(tenant?.plan ?? "free");
  const [tokenLimit, setTokenLimit] = useState(String(tenant?.token_limit ?? 100000));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sync local state when tenant changes
  if (tenant && plan !== tenant.plan && !saving) setPlan(tenant.plan);

  if (!tenant) return null;

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, token_limit: Number(tokenLimit) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: AdminTenant = await res.json();
      onUpdated(updated);
      onClose();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!tenant} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{tenant.email}</DialogTitle>
          {tenant.name && <p className="text-muted-foreground text-sm">{tenant.name}</p>}
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          Current usage: {fmt(tenant.tokens_used)} / {fmt(tenant.token_limit)} tokens
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="plan" className="text-xs text-muted-foreground">Plan</label>
            <select
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="free">free</option>
              <option value="pro">pro</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="tokenLimit" className="text-xs text-muted-foreground">
              Monthly token limit
            </label>
            <input
              id="tokenLimit"
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {tenant.stripe_customer_id && (
          <p className="font-mono text-xs text-muted-foreground">
            Stripe: {tenant.stripe_customer_id}
          </p>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/features/admin/components/TenantsPage.tsx`**

```tsx
"use client";

import { DataGrid } from "@repo/ui/components/data-grid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useEffect, useState } from "react";
import { TenantEditModal } from "./TenantEditModal";

type AdminTenant = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  token_limit: number;
  tokens_used: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const COLUMN_DEFS: ColDef<AdminTenant>[] = [
  { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
  { field: "name", headerName: "Name", width: 140 },
  {
    field: "plan",
    headerName: "Plan",
    width: 90,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) => {
      const plan = p.data?.plan;
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            plan === "pro"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {plan ?? "—"}
        </span>
      );
    },
  },
  {
    field: "token_limit",
    headerName: "Limit",
    width: 100,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) =>
      p.data ? fmt(p.data.token_limit) : null,
  },
  {
    colId: "usage",
    headerName: "Usage",
    width: 140,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) => {
      const t = p.data;
      if (!t) return null;
      const pct = Math.min((t.tokens_used / t.token_limit) * 100, 100);
      return (
        <div className="space-y-0.5 py-1">
          <p className="text-xs">{fmt(t.tokens_used)} / {fmt(t.token_limit)}</p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    },
  },
  {
    field: "stripe_customer_id",
    headerName: "Stripe Customer",
    width: 160,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) =>
      p.data?.stripe_customer_id ? (
        <span className="font-mono text-xs text-muted-foreground">
          {p.data.stripe_customer_id.slice(0, 18)}…
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    field: "created_at",
    headerName: "Created",
    width: 110,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) =>
      p.data ? new Date(p.data.created_at).toLocaleDateString() : null,
  },
];

export function TenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminTenant | null>(null);

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: AdminTenant[]) => setTenants(data))
      .catch(() => setError("Failed to load tenants."))
      .finally(() => setLoading(false));
  }, []);

  function handleUpdated(updated: AdminTenant) {
    setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <div className="space-y-4 p-8">
      <div>
        <h1 className="font-semibold text-2xl">Tenants</h1>
        <p className="text-muted-foreground text-sm">View and override plan limits</p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataGrid<AdminTenant>
        rowData={loading ? null : tenants}
        columnDefs={COLUMN_DEFS}
        height={520}
        loading={loading}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => { if (e.data) setSelected(e.data); }}
        overlayNoRowsTemplate="No tenants found."
        defaultColDef={{ sortable: true, resizable: true }}
      />

      <TenantEditModal
        tenant={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the page route**

Create `apps/web/src/app/admin/tenants/page.tsx`:

```tsx
import { TenantsPage } from "@/features/admin/components/TenantsPage";

export default function Page() {
  return <TenantsPage />;
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter web check-types
```

Expected: no errors.

- [ ] **Step 5: Run full Python test suite**

```bash
uv run pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/admin/components/TenantsPage.tsx apps/web/src/features/admin/components/TenantEditModal.tsx apps/web/src/app/admin/tenants/page.tsx
git commit -m "feat: add admin tenants page with DataGrid and edit modal"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All items covered — `banned` column (Task 1), banned check (Task 2), admin_users router (Task 3), admin_tenants router (Task 4), DataGrid component (Task 5), sidebar layout (Task 6), proxy routes (Task 7), Users page (Task 8), Tenants page (Task 9).
- [x] **No placeholders:** All code blocks are complete and runnable.
- [x] **Type consistency:** `AdminUser` and `AdminTenant` types defined in Task 8/9 components; column defs reference correct field names matching the Python `AdminUserOut`/`AdminTenantOut` models. `fmt()` helper duplicated in 4 files by design (YAGNI — no shared utility needed yet).
- [x] **session_token_usage column:** Uses `recorded_at` (verified from `services/memory/src/memory/session.py`).
- [x] **reset-password:** Intercepted in Next.js proxy; sends `email` in body from `UserDetailModal`.
- [x] **@repo/ui exports:** Path-based glob export `"./components/*"` already covers `data-grid.tsx` — no package.json export entry needed.
