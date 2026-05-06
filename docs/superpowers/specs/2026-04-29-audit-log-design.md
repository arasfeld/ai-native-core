# Audit Log Design

**Goal:** Record admin, auth, and tenant actions with actor + timestamp into an `audit_logs` table, expose them via a FastAPI endpoint, and display them in a read-only admin viewer page.

**Tech Stack:** PostgreSQL (asyncpg), FastAPI, Next.js App Router, shadcn/ui Table

---

## Schema

New DDL block `_CREATE_AUDIT_LOGS` added to `apps/server/src/api/main.py` lifespan (same pattern as `_CREATE_USER_PREFERENCES`):

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      TEXT        REFERENCES "user"(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
```

`actor_id` uses `ON DELETE SET NULL` so history is preserved when an admin account is deleted.

### Action strings (dot-namespaced)

| Action | Trigger |
|---|---|
| `user.banned` | Admin bans a user |
| `user.unbanned` | Admin unbans a user |
| `user.deleted` | Admin deletes a user |
| `tenant.plan_changed` | Admin changes a tenant's plan |
| `tenant.limit_changed` | Admin changes a tenant's token limit |
| `account.deleted` | User deletes their own account |

---

## Python helper

New file `apps/server/src/api/services/audit.py`:

```python
import asyncio
import json
import structlog
from fastapi import Request

log = structlog.get_logger()


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def _write(pool, actor_id, action, resource_type, resource_id, metadata, ip_address):
    try:
        await pool.execute(
            """
            INSERT INTO audit_logs
              (actor_id, action, resource_type, resource_id, metadata, ip_address)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            """,
            actor_id, action, resource_type, resource_id,
            json.dumps(metadata), ip_address,
        )
    except Exception as exc:
        log.warning("audit.write_failed", action=action, error=str(exc))


def log_audit_event(
    pool,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Fire-and-forget audit log write. Never blocks the caller."""
    asyncio.create_task(
        _write(pool, actor_id, action, resource_type,
               resource_id, metadata or {}, ip_address)
    )
```

---

## FastAPI

### New router: `apps/server/src/api/routers/audit_logs.py`

```
GET /admin/audit-logs?limit=50&offset=0
```

- Requires `Permission.ADMIN_USERS_READ`
- Joins `audit_logs` with `"user"` to resolve `actor_email`
- `limit` capped at 200
- Returns newest-first

Response shape per item:
```json
{
  "id": "uuid",
  "actor_id": "user-id or null",
  "actor_email": "admin@example.com or null",
  "action": "user.banned",
  "resource_type": "user",
  "resource_id": "target-user-id",
  "metadata": {},
  "ip_address": "1.2.3.4",
  "created_at": "2026-04-29T12:00:00Z"
}
```

Registered in `apps/server/src/api/main.py` alongside the other routers.

### Modified: `apps/server/src/api/routers/admin_users.py`

Add `actor: CurrentUser` parameter and `log_audit_event` call to `ban_user`, `unban_user`, and `delete_user`:

```python
async def ban_user(user_id: str, request: Request, actor: CurrentUser) -> dict:
    pool = request.app.state.db_pool
    await pool.execute('UPDATE "user" SET banned = TRUE WHERE id = $1', user_id)
    log_audit_event(pool, actor.id, "user.banned", "user", user_id,
                    ip_address=get_client_ip(request))
    return {"banned": True}
```

`unban_user` → `user.unbanned`, `delete_user` → `user.deleted` (same pattern).

### Modified: `apps/server/src/api/routers/admin_tenants.py`

Add `actor: CurrentUser` to `patch_tenant`. Log `tenant.plan_changed` when `body.plan` is set, `tenant.limit_changed` when `body.token_limit` is set. Fetch the existing row first to capture old values in `metadata`:

```python
async def patch_tenant(tenant_id: str, body: PatchTenantIn, request: Request, actor: CurrentUser):
    pool = request.app.state.db_pool
    existing = await pool.fetchrow("SELECT plan, \"tokenLimit\" FROM tenants WHERE id = $1", tenant_id)
    if body.plan is not None:
        await pool.execute("UPDATE tenants SET plan = $1 WHERE id = $2", body.plan, tenant_id)
        log_audit_event(pool, actor.id, "tenant.plan_changed", "tenant", tenant_id,
                        metadata={"old": existing["plan"], "new": body.plan},
                        ip_address=get_client_ip(request))
    if body.token_limit is not None:
        await pool.execute('UPDATE tenants SET "tokenLimit" = $1 WHERE id = $2', body.token_limit, tenant_id)
        log_audit_event(pool, actor.id, "tenant.limit_changed", "tenant", tenant_id,
                        metadata={"old": existing["tokenLimit"], "new": body.token_limit},
                        ip_address=get_client_ip(request))
    ...
```

### Modified: `apps/server/src/api/routers/auth.py`

`delete_account` already has `CurrentUser`. Add `log_audit_event` before the DELETE statements:

```python
log_audit_event(pool, current_user.id, "account.deleted", "user", current_user.id,
                ip_address=get_client_ip(request))
```

---

## Next.js Proxy

New file `apps/web/src/app/api/admin/audit-logs/route.ts`:

```
GET /api/admin/audit-logs?limit=50&offset=0  →  GET {API_URL}/admin/audit-logs
```

Requires auth (session check before proxying). Follows the same `buildProxyHeaders()` pattern as other admin proxy routes.

---

## Web UI

New page `apps/web/src/app/admin/audit-log/page.tsx`:

- Server component; fetches `/api/admin/audit-logs` on load
- shadcn/ui `Table` (not ag-grid — read-only, no sorting/filtering needed)
- Columns: **Time** (relative, e.g. "2 hours ago"), **Actor** (email), **Action**, **Resource** (`resource_type:resource_id`), **IP**
- Linked from the admin nav alongside Users and Tenants

---

## Testing

`apps/server/tests/test_audit_logs.py` — 6 tests using `TestClient` + mock pool + `app.dependency_overrides`:

1. `_write` inserts the expected row (direct async unit test)
2. `_write` swallows DB errors silently — mock pool raises, no exception propagates to caller
3. `POST /admin/users/{id}/ban` → mock pool records a `user.banned` insert call
4. `POST /admin/users/{id}/unban` → mock pool records a `user.unbanned` insert call
5. `DELETE /admin/users/{id}` → mock pool records a `user.deleted` insert call
6. `GET /admin/audit-logs` returns a list with `actor_email` resolved
