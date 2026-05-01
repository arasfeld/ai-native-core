# Phase 19 — User Settings & Preferences Design

## Goal

Deliver a unified `/settings` page covering profile editing, theme selection, and personal API key management. Replaces the standalone `/profile` page.

## Scope

**In scope (web only):**
- Unified `/settings` page with three tabs: Profile, Appearance, API Keys
- Profile tab: migrate existing `/profile` content to shadcn components
- Appearance tab: Light / Dark / System theme picker via `next-themes`
- API Keys tab: generate, name, revoke personal API keys (management only)
- `/profile` → 301 redirect to `/settings?tab=profile`
- DB table + FastAPI CRUD + Next.js proxy routes for API keys

**Out of scope:**
- API key authentication middleware for `/chat` (Phase 25, item 122)
- Mobile settings (Phase 23)
- Chat defaults (model, streaming), language/locale, privacy toggles (future phases)

---

## Architecture

### URL routing

Settings tabs are driven by `?tab=` query param so they are directly linkable. Default (no param) renders the Profile tab.

| URL | Tab |
|-----|-----|
| `/settings` | Profile |
| `/settings?tab=profile` | Profile |
| `/settings?tab=appearance` | Appearance |
| `/settings?tab=api-keys` | API Keys |

`proxy.ts` already has `/settings` in `PROTECTED_PATHS`. Remove `/profile` from `PROTECTED_PATHS` (the page itself redirects; the data it displayed is now behind `/settings`).

### Frontend structure

```
apps/web/src/
  app/
    settings/
      page.tsx              # server component — reads searchParams.tab, renders SettingsPage
    profile/
      page.tsx              # redirect → /settings?tab=profile (replaces existing ProfilePage)
  features/
    settings/
      components/
        SettingsPage.tsx    # client component — shadcn Tabs shell
        ProfileTab.tsx      # migrated profile form (shadcn Input/Button/Card)
        AppearanceTab.tsx   # theme picker
        ApiKeysTab.tsx      # key list + generate button + one-time reveal modal
      index.ts
```

### API Keys — DB schema

Migration added to `packages/db/migrations/0006_user_api_keys.sql` and reflected in `packages/db/src/schema/app.ts` (Drizzle) and `packages/db/src/migrate.ts`.

```sql
CREATE TABLE IF NOT EXISTS user_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 hex of full key
  key_prefix   TEXT NOT NULL,          -- first 8 chars, shown in UI
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,            -- updated by Phase 25 auth middleware
  revoked_at   TIMESTAMPTZ             -- NULL = active; set to revoke
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS user_api_keys_key_hash_idx ON user_api_keys(key_hash);
```

### API Key format

Keys are formatted as `ak_` + 64 hex chars (32 random bytes) = 67-character string. Generated server-side using `secrets.token_hex(32)`. The SHA-256 hash of the full key is stored; the plaintext is returned exactly once in the creation response and never stored.

`key_prefix` = first 8 characters of the full key (e.g. `ak_a1b2c3`) — displayed in the UI to let users identify which key is which.

### API Keys — FastAPI router

New router at `apps/server/src/api/routers/user_api_keys.py`, mounted at `/user/api-keys`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/user/api-keys` | List active (non-revoked) keys for current user |
| `POST` | `/user/api-keys` | Generate new key — returns plaintext key once |
| `DELETE` | `/user/api-keys/{id}` | Soft-revoke (set `revoked_at = NOW()`) |

Response models:
```python
class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

class ApiKeyCreated(BaseModel):
    key: str        # full plaintext key — shown once
    id: str
    name: str
    key_prefix: str
    created_at: datetime
```

Ownership enforced on DELETE: 404 if key doesn't belong to the authenticated user.

### API Keys — Next.js proxy routes

```
apps/web/src/app/api/user/api-keys/
  route.ts          # GET (list) + POST (create)
  [id]/
    route.ts        # DELETE (revoke)
```

Same pattern as existing admin and conversations proxy routes — forward session cookie to FastAPI.

### Appearance tab

No backend. `useTheme()` from `next-themes` provides `theme` (current) and `setTheme()`. Three buttons render as a segmented control: **Light** / **Dark** / **System**. The active button is highlighted. `next-themes` persists the choice in `localStorage`.

### Profile tab

Migrates the existing `ProfilePage` content to shadcn components (`Input`, `Button`, `Card`, `CardHeader`, `CardContent`). Functionality unchanged:
- Edit display name + avatar URL → `authClient.updateUser()`
- Load + revoke active sessions → `authClient.listSessions()` / `authClient.revokeSession()`
- Delete account with typed confirmation → `DELETE /api/auth/account`

### API Keys tab — UX

- Table columns: Name · Prefix · Created · Last used · Actions
- "Generate new key" button → dialog with name input → on submit, shows one-time reveal panel with full key + copy button + "I've copied this key" confirm to close
- Revoke button per row → confirmation dialog before revoking
- Empty state: "No API keys yet. Generate your first key to use the API programmatically."

---

## Data flow

```
User clicks "Generate new key"
  → POST /api/user/api-keys (Next.js proxy)
    → POST /user/api-keys (FastAPI, authenticated)
      → secrets.token_hex(32) → full_key = "ak_" + hex
      → key_hash = sha256(full_key).hexdigest()
      → key_prefix = full_key[:8]
      → INSERT into user_api_keys
      → return ApiKeyCreated { key: full_key, ... }
  → Next.js returns response to client
  → ApiKeysTab shows one-time reveal modal with full key
  → User copies key, clicks confirm
  → Key only shown in table as prefix from now on
```

---

## Testing

**Python (pytest):**
- `apps/server/tests/test_user_api_keys.py`
  - `POST /user/api-keys` returns key with `ak_` prefix and 67 chars
  - `GET /user/api-keys` lists only active (non-revoked) keys for current user
  - `DELETE /user/api-keys/{id}` revokes correctly; 404 for other user's key
  - Key hash stored is SHA-256 of returned plaintext key

**TypeScript (Vitest):** No new logic to unit-test (UI components use existing shadcn primitives). Type-check via `pnpm check-types`.

---

## Migration path

1. DB migration (`0006_user_api_keys.sql`) + Drizzle schema + `migrate.ts`
2. FastAPI router + tests
3. Next.js proxy routes
4. `/settings` page + `SettingsPage` with tabs
5. `ProfileTab` — migrate existing profile content
6. `AppearanceTab` — theme picker
7. `ApiKeysTab` — key management UI
8. `/profile` redirect + remove from `PROTECTED_PATHS`
