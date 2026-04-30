# Admin Dashboard (Phase 16a) — Design Spec

## Goal

Add a proper admin dashboard with a persistent sidebar, ag-grid–powered user and tenant management tables, and user action modals (ban, delete, reset password, edit plan).

## Scope

This spec covers Phase 16 items **#80 (User management UI)** and **#81 (Tenant management UI)**, plus the shared DataGrid component foundation. Analytics (#82) and Audit log (#83) are separate follow-up specs.

---

## Architecture

### Approach

- **DataGrid in `@repo/ui`** — ag-grid community edition added to the shared UI package, matching the maintenance-app pattern exactly. Reusable across all apps in the monorepo.
- **Admin sidebar layout** — new `apps/web/src/app/admin/layout.tsx` wrapping all `/admin/*` routes with a persistent left sidebar.
- **Two new FastAPI routers** — `admin_users.py` and `admin_tenants.py`, both RBAC-gated via `require_permission`.
- **Two new Next.js proxy routes** — catch-all routes forwarding to FastAPI, gated by `isAdmin` at the Next.js layer.
- **Modal for user/tenant actions** — shadcn `Dialog` opened on row click.

### Tech Stack

- `ag-grid-community` 35.2.0 + `ag-grid-react` 35.2.0
- `themeQuartz` from `ag-grid-community/theming` bridged to existing CSS variables
- shadcn `Dialog` for action modals
- FastAPI + asyncpg for new admin endpoints
- Resend (existing email setup) for password reset emails

---

## Section 1 — Data Model

### Migration: `packages/db/migrations/0004_user_banned.sql`

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE;
```

### Drizzle schema: `packages/db/src/schema/auth.ts`

Add after `isAdmin`:

```typescript
banned: boolean("banned").default(false).notNull(),
```

### FastAPI auth change: `apps/server/src/api/auth/deps.py`

After session lookup, before loading permissions:

```python
if row["banned"]:
    raise HTTPException(status_code=401, detail="Account suspended")
```

The session query must include `u.banned` in the SELECT.

### No other schema changes

Tenant plan overrides update existing `plan` (TEXT) and `tokenLimit` (INTEGER) columns in the `tenants` table.

---

## Section 2 — Shared DataGrid Component

### Package changes: `packages/ui/package.json`

```json
"ag-grid-community": "35.2.0",
"ag-grid-react": "^35.2.0"
```

### New file: `packages/ui/src/components/data-grid.tsx`

- Defines `aiNativeCoreGridTheme` using `themeQuartz.withParams({...})` with CSS variable mappings:
  - `backgroundColor: "var(--background)"`
  - `foregroundColor: "var(--foreground)"`
  - `borderColor: "var(--border)"`
  - `chromeBackgroundColor: "var(--card)"`
  - `headerBackgroundColor: "var(--muted)"`
  - `accentColor: "var(--primary)"`
  - `rowHoverColor: "color-mix(in oklch, var(--muted) 50%, transparent)"`
  - `selectedRowBackgroundColor: "color-mix(in oklch, var(--primary) 14%, var(--background))"`
  - `browserColorScheme: "inherit"` (dark/light auto)
  - `fontFamily: ["var(--font-sans)", "ui-sans-serif", ...]`
  - `spacing: 8`, `headerFontSize: 12`, `dataFontSize: 14`
- `DataGridProps<TData>` extends `GridOptions<TData>` (omitting `rowData`, `columnDefs`, `theme`) plus:
  - `rowData: TData[] | null | undefined`
  - `columnDefs: ColDef<TData>[]`
  - `theme?: Theme` (defaults to `aiNativeCoreGridTheme`)
  - `className?: string`
  - `height?: number | string` (default `480`)
- `DataGrid<TData>` component wraps `AgGridProvider` + `AgGridReact` with `AllCommunityModule`, pagination enabled by default, `paginationPageSize={25}`, `paginationPageSizeSelector={[10, 25, 50, 100]}`

### Export: `packages/ui/src/index.ts`

```typescript
export { DataGrid } from "./components/data-grid";
export type { DataGridProps } from "./components/data-grid";
```

---

## Section 3 — Admin Sidebar Layout

### New file: `apps/web/src/app/admin/layout.tsx`

Server component. Renders a two-column flex layout:
- Left: `AdminNav` client component (fixed width ~200px)
- Right: `<main className="flex-1 min-h-screen">{children}</main>`

### New file: `apps/web/src/features/admin/components/AdminNav.tsx`

`"use client"` component using `usePathname()` to highlight active link.

Nav links (in order):
| Label | href |
|-------|------|
| Users | `/admin/users` |
| Tenants | `/admin/tenants` |
| RBAC | `/admin/rbac` |
| AI Config | `/admin` |

Active link style: `border-primary font-medium text-foreground`. Inactive: `text-muted-foreground hover:text-foreground`.

The existing `/admin/page.tsx` (AI Config) is unchanged — it gains the sidebar wrapper automatically.

---

## Section 4 — FastAPI Endpoints

### New file: `apps/server/src/api/routers/admin_users.py`

Prefix: `/admin/users`. All endpoints require `ADMIN_USERS_READ` or `ADMIN_USERS_WRITE`.

#### `GET /admin/users`

Query parameter: `search: str = ""`

Returns list of `AdminUserOut`:
```python
class AdminUserOut(BaseModel):
    id: str
    email: str
    name: str | None
    is_admin: bool
    banned: bool
    plan: str | None          # from tenants table, None if no tenant
    token_limit: int | None
    tokens_used: int          # SUM for current calendar month
    created_at: datetime
```

SQL: JOIN `user` → `tenants` (LEFT JOIN on `tenants.id = user.id`) → monthly token usage subquery (`SELECT tenant_id, SUM(tokens) FROM session_token_usage WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) GROUP BY tenant_id`). `ILIKE` search on email/name. `ORDER BY "createdAt" DESC LIMIT 100`.

> **Implementation note:** Verify the exact timestamp column name in `session_token_usage` before writing the query — the table is created by `SessionStore` in `services/memory`, not tracked in Drizzle schema files. Check `services/memory/src/memory/session.py` for the `CREATE TABLE` statement.

#### `POST /admin/users/{user_id}/ban`

```sql
UPDATE "user" SET "banned" = TRUE WHERE id = $1
```

Returns `{"banned": true}`.

#### `POST /admin/users/{user_id}/unban`

```sql
UPDATE "user" SET "banned" = FALSE WHERE id = $1
```

Returns `{"banned": false}`.

#### `DELETE /admin/users/{user_id}`

```sql
DELETE FROM "user" WHERE id = $1
```

Returns 204. All related rows cascade-delete.

#### `POST /admin/users/{user_id}/reset-password`

**Handled entirely in the Next.js proxy layer — no FastAPI endpoint.**

The Next.js route `apps/web/src/app/api/admin/users/[...path]/route.ts` intercepts `POST .../reset-password`, fetches the user's email via `GET /api/admin/users` (or a direct DB lookup via `auth.api`), then calls:

```typescript
await auth.api.requestPasswordReset({
  body: { email, redirectTo: "/reset-password" },
  headers: await headers(),
});
```

Returns 204 on success. This keeps all better-auth and Resend logic on the Next.js side where it is already configured.

### New file: `apps/server/src/api/routers/admin_tenants.py`

Prefix: `/admin/tenants`. All endpoints require `ADMIN_USERS_READ` or `ADMIN_USERS_WRITE`.

#### `GET /admin/tenants`

Returns list of `AdminTenantOut`:
```python
class AdminTenantOut(BaseModel):
    id: str                       # same as user.id
    email: str
    name: str | None
    plan: str
    token_limit: int
    tokens_used: int              # current month
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    created_at: datetime
```

SQL: JOIN `tenants` → `user` (on `tenants.id = user.id`) → monthly usage subquery. `ORDER BY tenants."createdAt" DESC LIMIT 200`.

#### `PATCH /admin/tenants/{tenant_id}`

Body:
```python
class PatchTenantIn(BaseModel):
    plan: str | None = None          # 'free' | 'pro'
    token_limit: int | None = None
```

Updates only provided fields. Returns updated `AdminTenantOut`. Does not touch Stripe — manual DB override only.

### `apps/server/src/api/main.py` changes

```python
from .routers import admin, admin_users, admin_tenants, auth, billing, chat, health, ingest, jobs, media, rbac

app.include_router(admin_users.router)
app.include_router(admin_tenants.router)
```

---

## Section 5 — Next.js Proxy Routes + UI

### New file: `apps/web/src/app/api/admin/users/[...path]/route.ts`

Same pattern as `/api/rbac/[...path]/route.ts`: checks `session?.user.isAdmin`, forwards to `${API_URL}/admin/users/...` with cookie passthrough. Supports GET, POST, DELETE.

### New file: `apps/web/src/app/api/admin/tenants/[...path]/route.ts`

Same pattern. Supports GET, PATCH.

### New file: `apps/web/src/features/admin/components/UsersPage.tsx`

`"use client"`. Fetches `/api/admin/users?search=...` on mount and on search input (debounced 300ms).

**DataGrid columns** (`ColDef<AdminUser>[]`):
| Field | Header | Notes |
|-------|--------|-------|
| `email` | Email | flex: 1, min 200px |
| `name` | Name | width 140 |
| `plan` | Plan | width 90; badge cell: green "pro", grey "free", grey "—" |
| `tokens_used / token_limit` | Usage | width 130; renders `"1.2M / 2M"` with a thin progress bar |
| `is_admin` | Admin | width 70; "✓" badge if true |
| `banned` | Status | width 80; red "banned" badge or green "active" |
| `created_at` | Joined | width 110; formatted date |

Row click → opens `UserDetailModal` with the selected user.

Search input above the grid (`<input type="search">`), resets on clear.

### New file: `apps/web/src/features/admin/components/UserDetailModal.tsx`

shadcn `Dialog`. Props: `user: AdminUser | null`, `onClose()`, `onUpdated(user: AdminUser)`.

Content:
- Header: email + name
- Info row: plan, usage, joined date
- Divider
- **Ban / Unban** button — POST `/api/admin/users/{id}/ban` or `/unban`; calls `onUpdated` with toggled `banned` field
- **Reset password** button — confirm dialog ("Send reset email to {email}?") → POST `/api/admin/users/{id}/reset-password`; shows success toast
- **Delete** button (destructive) — confirm dialog with typed email verification → DELETE `/api/admin/users/{id}`; calls `onClose` and removes row from grid

### New file: `apps/web/src/features/admin/components/TenantsPage.tsx`

`"use client"`. Fetches `/api/admin/tenants` on mount.

**DataGrid columns** (`ColDef<AdminTenant>[]`):
| Field | Header | Notes |
|-------|--------|-------|
| `email` | Email | flex: 1, min 200px |
| `name` | Name | width 140 |
| `plan` | Plan | width 90; badge |
| `token_limit` | Limit | width 100; formatted (e.g. "2M") |
| `tokens_used / token_limit` | Usage | width 130; `"1.2M / 2M"` + progress bar |
| `stripe_customer_id` | Stripe Customer | width 150; monospace, truncated |
| `created_at` | Created | width 110; formatted date |

Row click → opens `TenantEditModal`.

### New file: `apps/web/src/features/admin/components/TenantEditModal.tsx`

shadcn `Dialog`. Props: `tenant: AdminTenant | null`, `onClose()`, `onUpdated(tenant: AdminTenant)`.

Content:
- Header: email + current plan badge
- Usage info
- **Plan** `<select>`: `free` / `pro`
- **Token limit** `<input type="number">`: current value pre-filled
- Save button → PATCH `/api/admin/tenants/{id}`; calls `onUpdated`

### New pages

- `apps/web/src/app/admin/users/page.tsx` → renders `<UsersPage />`
- `apps/web/src/app/admin/tenants/page.tsx` → renders `<TenantsPage />`

---

## File Summary

### New files
| File | Purpose |
|------|---------|
| `packages/db/migrations/0004_user_banned.sql` | Add `banned` column |
| `packages/ui/src/components/data-grid.tsx` | Shared ag-grid DataGrid component |
| `apps/server/src/api/routers/admin_users.py` | User management API |
| `apps/server/src/api/routers/admin_tenants.py` | Tenant management API |
| `apps/web/src/app/admin/layout.tsx` | Admin sidebar layout |
| `apps/web/src/features/admin/components/AdminNav.tsx` | Sidebar nav client component |
| `apps/web/src/app/api/admin/users/[...path]/route.ts` | Users proxy route |
| `apps/web/src/app/api/admin/tenants/[...path]/route.ts` | Tenants proxy route |
| `apps/web/src/app/admin/users/page.tsx` | Users admin page |
| `apps/web/src/app/admin/tenants/page.tsx` | Tenants admin page |
| `apps/web/src/features/admin/components/UsersPage.tsx` | Users grid + search |
| `apps/web/src/features/admin/components/UserDetailModal.tsx` | Ban/delete/reset modal |
| `apps/web/src/features/admin/components/TenantsPage.tsx` | Tenants grid |
| `apps/web/src/features/admin/components/TenantEditModal.tsx` | Plan/limit edit modal |

### Modified files
| File | Change |
|------|--------|
| `packages/db/src/schema/auth.ts` | Add `banned` column |
| `packages/db/src/migrate.ts` | Add banned ALTER TABLE |
| `packages/ui/package.json` | Add ag-grid deps |
| `packages/ui/src/index.ts` | Export DataGrid |
| `apps/server/src/api/auth/deps.py` | Check `banned` after session lookup |
| `apps/server/src/api/main.py` | Register new routers |

---

## Testing

### Python (pytest)
- `test_admin_users.py`: list users (with/without search), ban/unban, delete, reset-password (mock Resend)
- `test_admin_tenants.py`: list tenants, patch plan, patch token_limit
- Permission enforcement: unprivileged user gets 403 on all endpoints

### TypeScript (Vitest)
- No new TS unit tests needed — UI components are tested via type-checking + manual verification

### Manual verification checklist
- [ ] Sidebar renders on all /admin/* routes, active link highlights correctly
- [ ] Users grid loads, search filters rows
- [ ] Ban user → they get 401 on next request; Unban → they can log in again
- [ ] Delete user → row removed from grid, cascade confirmed (no orphan rows)
- [ ] Reset password → email sent (or reset URL returned if no Resend key)
- [ ] Tenants grid loads with usage data
- [ ] Edit tenant plan/limit → reflected immediately in grid
- [ ] Dark mode: grid theme matches app theme
