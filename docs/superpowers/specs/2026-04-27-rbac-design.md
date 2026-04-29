# Flexible RBAC Design

> **For agentic workers:** Use `superpowers:writing-plans` to create an implementation plan from this spec.

**Goal:** A flexible, org-scoped role-based access control system where permissions can be assigned directly to users or to roles, multiple roles can be assigned to users, and effective permissions equal the union of direct grants and all role-derived grants.

**Architecture:** Five new Postgres tables store permissions, roles, role-permission assignments, user-role assignments, and direct user-permission grants — all with optional `org_id` for future org-scoping. A denormalized `isAdmin` boolean on the `user` table enables zero-latency admin checks in Next.js Edge middleware. FastAPI loads effective permissions once per request at session resolution; endpoints declare required permissions via a dependency factory.

**Tech Stack:** Postgres (asyncpg), Drizzle ORM (TypeScript schema), FastAPI dependencies, better-auth `additionalFields`, Next.js Edge middleware, shadcn/ui admin page.

---

## Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Org scope | Org-scoped from day one (`org_id` nullable on assignments) | Avoids migration pain when Phase 17 (Organizations) lands |
| Permission definition | Static / code-defined constants | Type-safe, no typo footguns, seeded at startup |
| Role inheritance | None — explicit assignment only | Simpler queries; permission count is small in a starter |
| Enforcement model | DB RBAC — one query per request at session resolution | No Redis dependency; fast enough for a SaaS starter |
| Admin route gating | Denormalized `isAdmin` on `user` table | Edge middleware can't make extra DB calls; synced on role change |

---

## Data Model

### New tables

```sql
-- Permission catalog (static, seeded at startup)
CREATE TABLE permissions (
  id          TEXT PRIMARY KEY,       -- e.g. "admin:users:read"
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role catalog (static, seeded at startup)
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,       -- e.g. "admin"
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role → Permission assignments
CREATE TABLE role_permissions (
  role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User → Role assignments (optionally org-scoped)
CREATE TABLE user_roles (
  id          TEXT PRIMARY KEY,       -- nanoid
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role_id     TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_id      TEXT,                   -- NULL = global/system scope
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (user_id, role_id, org_id)
);

-- User → Permission direct grants (optionally org-scoped)
CREATE TABLE user_permissions (
  id            TEXT PRIMARY KEY,     -- nanoid
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  org_id        TEXT,                 -- NULL = global/system scope
  created_at    TIMESTAMPTZ NOT NULL  DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (user_id, permission_id, org_id)
);
```

### Existing `user` table change

```sql
ALTER TABLE "user" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE;
```

Kept in sync whenever a global `admin` or `super_admin` role is assigned or revoked.

### Drizzle schema

New file `packages/db/src/schema/rbac.ts` exports all five tables. `packages/db/src/schema.ts` re-exports from it. `packages/db/src/schema/auth.ts` gains the `isAdmin` column.

---

## Permission Constants

`packages/auth/src/permissions.ts`:

```typescript
export const PERMISSIONS = {
  ADMIN_USERS_READ:    "admin:users:read",
  ADMIN_USERS_WRITE:   "admin:users:write",
  ADMIN_BILLING_READ:  "admin:billing:read",
  ADMIN_BILLING_WRITE: "admin:billing:write",
  BILLING_MANAGE:      "billing:manage",
  ORG_MEMBERS_INVITE:  "org:members:invite",
  ORG_MEMBERS_REMOVE:  "org:members:remove",
  ORG_SETTINGS_WRITE:  "org:settings:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
```

Mirrored in Python at `apps/server/src/api/rbac/permissions.py` as a `str` enum.

---

## Built-in Roles (seeded at startup)

| Role | Permissions |
|------|------------|
| `super_admin` | all 8 permissions |
| `admin` | `admin:users:read`, `admin:users:write`, `admin:billing:read`, `admin:billing:write`, `billing:manage` |
| `member` | `billing:manage` |

---

## Seeding

`apps/server/src/api/rbac/seed.py` — called from the FastAPI `lifespan` startup hook. Uses `INSERT ... ON CONFLICT DO NOTHING` throughout:

1. Insert all `PERMISSIONS` entries into `permissions`
2. Insert `super_admin`, `admin`, `member` into `roles`
3. Assign permissions to roles per table above

---

## FastAPI Enforcement

### AuthUser extension (`apps/server/src/api/auth/deps.py`)

```python
class AuthUser(BaseModel):
    id: str
    email: str
    name: str | None = None
    image: str | None = None
    email_verified: bool = False
    permissions: frozenset[str] = frozenset()
```

### Session resolution query

`get_current_user` runs one additional query after resolving the session:

```sql
SELECT DISTINCT p.id
FROM permissions p
WHERE p.id IN (
  SELECT permission_id FROM user_permissions
  WHERE user_id = $1
    AND (org_id = $2 OR (org_id IS NULL AND $2 IS NULL))
  UNION
  SELECT rp.permission_id
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = $1
    AND (ur.org_id = $2 OR (ur.org_id IS NULL AND $2 IS NULL))
)
```

`$1` = user id, `$2` = active org id (from `X-Org-Id` request header; `NULL` for global requests).

### Dependency factory (`apps/server/src/api/rbac/deps.py`)

```python
from fastapi import Depends, HTTPException
from api.auth.deps import CurrentUser
from api.rbac.permissions import Permission

def require_permission(permission: Permission):
    async def _check(user: CurrentUser) -> None:
        if permission not in user.permissions:
            raise HTTPException(status_code=403, detail="Forbidden")
    return Depends(_check)
```

Usage:

```python
@router.get("/admin/users", dependencies=[require_permission(Permission.ADMIN_USERS_READ)])
async def list_users(...): ...
```

### isAdmin sync helper (`apps/server/src/api/rbac/helpers.py`)

```python
async def sync_is_admin(pool: asyncpg.Pool, user_id: str) -> None:
    row = await pool.fetchrow(
        """SELECT 1 FROM user_roles
           WHERE user_id = $1 AND role_id IN ('admin', 'super_admin') AND org_id IS NULL
           LIMIT 1""",
        user_id,
    )
    await pool.execute(
        'UPDATE "user" SET "isAdmin" = $1 WHERE id = $2',
        row is not None,
        user_id,
    )
```

Called after every role assignment or revocation.

---

## Management API (`apps/server/src/api/routers/rbac.py`)

All endpoints require `admin:users:read` (GET) or `admin:users:write` (mutations).

```
GET    /rbac/permissions                              list all permissions
GET    /rbac/roles                                    list roles with their permissions
POST   /rbac/roles/{role_id}/permissions              add permission to role
DELETE /rbac/roles/{role_id}/permissions/{perm_id}   remove permission from role

GET    /rbac/users/{user_id}/roles                   list user's role assignments
POST   /rbac/users/{user_id}/roles                   assign role  { role_id, org_id? }
DELETE /rbac/users/{user_id}/roles/{role_id}         revoke role (global scope)

GET    /rbac/users/{user_id}/permissions             list user's direct grants
POST   /rbac/users/{user_id}/permissions             grant permission  { permission_id, org_id? }
DELETE /rbac/users/{user_id}/permissions/{perm_id}  revoke direct permission
```

Mutation endpoints that touch `user_roles` call `sync_is_admin` after the DB write.

---

## Next.js Changes

### proxy.ts — admin gating

```typescript
if (pathname.startsWith("/admin")) {
  if (!session?.user?.isAdmin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
}
```

### better-auth config — additionalFields

`packages/auth/src/index.ts` adds:

```typescript
user: {
  additionalFields: {
    isAdmin: { type: "boolean", defaultValue: false, input: false },
  },
},
```

This causes better-auth to include `isAdmin` in the session user object from its own DB query.

### Proxy API route

`apps/web/src/app/api/rbac/[...path]/route.ts` — catch-all that forwards all methods to FastAPI `/rbac/...`, attaching the session cookie. Follows the same pattern as `apps/web/src/app/api/billing/plan/route.ts`.

---

## Admin UI (`apps/web/src/app/admin/rbac/page.tsx`)

Two-tab page under the existing `/admin` layout:

**Users tab**
- Search/filter users table
- Click user → side panel with current roles (badges) + direct permissions (badges)
- "Assign role" dropdown → POST `/api/rbac/users/{id}/roles`
- "Revoke" button per role/permission → DELETE

**Roles tab**
- List of roles with their permission badges
- "Add permission" dropdown per role → POST `/api/rbac/roles/{id}/permissions`
- "Remove" button per permission → DELETE

Uses shadcn/ui `Table`, `Badge`, `Select`, `Sheet` (side panel), `AlertDialog` (revoke confirmation). No new UI primitives needed.

---

## Testing

- **Python:** `apps/server/tests/test_rbac.py` — unit tests using `dependency_overrides` and `AsyncMock`. Covers: permission resolution (direct + role-derived + union), `require_permission` 403 on missing, `sync_is_admin` sets flag correctly, all CRUD endpoints.
- **TypeScript:** proxy middleware unit test — mock session with/without `isAdmin`, assert redirect behavior.

---

## Out of Scope

- Role inheritance / hierarchy (explicit assignment only)
- Dynamic permission creation at runtime (static constants only)
- Per-resource object-level permissions (e.g., "can edit document X")
- Org-scoped permission queries (schema supports it; logic wired in Phase 17)
