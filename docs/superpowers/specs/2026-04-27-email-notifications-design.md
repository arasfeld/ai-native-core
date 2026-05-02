# Phase 20 — Email & Notifications Design

## Goal

Add React Email templates, an in-app notification center (bell + popover), and budget threshold alerts (80%/100%) delivered both as emails and in-app notifications.

## Scope

**In scope (items 98–100):**
- Transactional email templates via React Email + Resend
- In-app notification center (bell icon + popover, polling-based)
- Budget warning notifications at 80% and 100% of monthly token budget

**Deferred:**
- Item 101 (security alerts / login IP tracking) — needs its own IP-tracking table and careful logic
- Item 102 (mobile push) — deferred to Phase 23 (Mobile Parity)

## Architecture

### New package: `packages/emails`

A new workspace package containing all React Email components. `packages/auth` becomes a consumer, replacing its existing inline HTML strings.

**Templates:**
- `WelcomeEmail` — sent on new user signup via better-auth `databaseHooks.user.create.after`
- `PasswordResetEmail` — migrates the existing inline HTML in `packages/auth/src/index.ts`
- `BudgetWarningEmail` — shared template for 80% and 100% thresholds; props: `{ percent: 80 | 100, used: number, limit: number, upgradeUrl: string }`

**Exports:**
- `sendEmail(to: string, subject: string, element: ReactElement): Promise<void>` — renders to HTML and calls Resend
- Individual template components

**Dependencies:** `@react-email/components`, `@react-email/render`, `resend`

### DB schema (`packages/db/migrations/0007_notifications.sql`)

```sql
CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_id_idx ON notifications(user_id);

ALTER TABLE tenants ADD COLUMN budget_warned_80_at  TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN budget_warned_100_at TIMESTAMPTZ;
```

**Notification types:** `budget_warning_80`, `budget_warning_100`, `welcome`

**Tenant columns:** `budget_warned_80_at` / `budget_warned_100_at` — set when an alert fires; NULL or a prior-month timestamp means the alert can fire again. Reset logic: if the stored timestamp is in a prior calendar month, treat as not-yet-warned.

### FastAPI: `apps/server/src/api/routers/notifications.py`

- `GET /notifications?limit=20` — returns unread-first, then read, max `limit`, for current user
- `PATCH /notifications/{id}/read` — sets `read_at = NOW()` for the given notification (must belong to current user)
- `PATCH /notifications/read-all` — sets `read_at = NOW()` for all unread notifications for current user

### Budget check service: `apps/server/src/api/services/budget_notifications.py`

`check_budget_thresholds(pool, tenant_id: str, user_id: str) -> None`

Called fire-and-forget via `asyncio.create_task(check_budget_thresholds(...))` after `budget.record()` in `apps/server/src/api/routers/chat.py`.

Logic:
1. Fetch tenant row: `token_limit`, `budget_warned_80_at`, `budget_warned_100_at`
2. Query current month's token usage from `session_token_usage`
3. Calculate `percent = used / limit * 100`
4. For each threshold (80, 100):
   - Check if `percent >= threshold`
   - Check if `warned_at` is NULL or in a prior calendar month
   - If both true: insert notification row + send `BudgetWarningEmail` + update `budget_warned_{threshold}_at`
5. Uses `RETURNING` on the notification insert to get the id for logging

### Next.js proxy routes

- `GET /api/notifications` → `GET {FASTAPI_URL}/notifications`
- `PATCH /api/notifications/[id]/read` → `PATCH {FASTAPI_URL}/notifications/{id}/read`
- `PATCH /api/notifications/read-all` → `PATCH {FASTAPI_URL}/notifications/read-all`

All routes require authentication (session forwarded via `Cookie` header, same pattern as conversations proxy).

### Web UI: `apps/web/src/features/notifications/`

**`NotificationBell`** (placed in chat header, next to `UserMenu`):
- Fetches `GET /api/notifications` on mount and every 60s via `setInterval`
- Renders a bell icon (`BellIcon` from lucide-react) with a red badge showing unread count
- Badge hidden when count is 0
- Triggers the `NotificationPopover` on click

**`NotificationPopover`** (Radix `Popover`):
- Lists up to 10 recent notifications, unread first
- Each notification has a colored left border: green (`bg-green-500`) for budget warnings, purple (`bg-violet-500`) for welcome
- Unread items have slightly brighter styling; read items are dimmed
- "Mark all read" button at the bottom (calls `PATCH /api/notifications/read-all`, then refetches)
- Clicking an individual notification marks it read inline (optimistic update + `PATCH /api/notifications/{id}/read`)
- Empty state: "No notifications yet"

## File Map

### Create
| File | Purpose |
|------|---------|
| `packages/emails/package.json` | New workspace package |
| `packages/emails/src/index.ts` | `sendEmail` function + template exports |
| `packages/emails/src/templates/WelcomeEmail.tsx` | Welcome template |
| `packages/emails/src/templates/PasswordResetEmail.tsx` | Password reset template |
| `packages/emails/src/templates/BudgetWarningEmail.tsx` | Budget warning template |
| `packages/db/migrations/0007_notifications.sql` | notifications table + tenant columns |
| `apps/server/src/api/routers/notifications.py` | FastAPI notifications router |
| `apps/server/src/api/services/budget_notifications.py` | Budget threshold check service |
| `apps/server/tests/test_notifications.py` | Python tests |
| `apps/web/src/app/api/notifications/route.ts` | GET proxy |
| `apps/web/src/app/api/notifications/[id]/read/route.ts` | PATCH read proxy |
| `apps/web/src/app/api/notifications/read-all/route.ts` | PATCH read-all proxy |
| `apps/web/src/features/notifications/components/NotificationBell.tsx` | Bell + badge |
| `apps/web/src/features/notifications/components/NotificationPopover.tsx` | Popover list |
| `apps/web/src/features/notifications/index.ts` | Feature barrel export |

### Modify
| File | Change |
|------|--------|
| `packages/auth/src/index.ts` | Replace inline HTML with `packages/emails` templates; add welcome email via `databaseHooks` |
| `packages/auth/package.json` | Add `@repo/emails` dependency |
| `apps/server/src/api/main.py` | Register notifications router |
| `apps/server/src/api/routers/chat.py` | Add `asyncio.create_task(check_budget_thresholds(...))` after `budget.record()` |
| `apps/web/src/app/chat.tsx` | Import and render `NotificationBell` in header |

## Testing

**Python (TDD):**
- `test_list_returns_empty_for_new_user`
- `test_list_requires_auth`
- `test_mark_read_sets_read_at`
- `test_mark_all_read`
- `test_budget_check_inserts_notification_at_80_percent`
- `test_budget_check_does_not_duplicate_same_month`
- `test_budget_check_fires_again_next_month`

**TypeScript:** `pnpm check-types` must pass clean.

**Manual:** Trigger a chat turn that pushes usage over 80% threshold; confirm notification appears in bell popover and email is sent (check Resend logs).
