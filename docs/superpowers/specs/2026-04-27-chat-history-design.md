# Chat History & Conversations — Design Spec (Phase 18a)

## Scope

Items 89–91 from the roadmap:
- **89** Conversation persistence — named sessions stored in DB, title auto-generated
- **90** Conversation sidebar + switcher — persistent left sidebar, active-link highlighting, new chat
- **91** Conversation management — inline rename, delete with confirmation

Items 92–94 (full-text search, export, custom system instructions) are deferred.

---

## Problem

Every page refresh loses the chat history. `session_id` always defaults to `"default"` on the client, so all messages pile into one bucket and nothing survives navigation. There is no way to start a new conversation, resume a past one, or rename/delete conversations.

---

## Data Model

### New table: `conversations`

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
```

- `id` is a client-generated UUID (nanoid or `crypto.randomUUID()`). It doubles as the `session_id` passed to `/chat`.
- `updated_at` is bumped on every chat message (kept in sync by `ChatService`).
- `chat_sessions` rows are still keyed by `session_id` string — no schema change needed there.
- **Guests** continue to use `session_id = "default"` with no persistence. The sidebar is only rendered for authenticated users.

### Migration

`packages/db/migrations/0005_conversations.sql` — the `CREATE TABLE` above.

`packages/db/src/migrate.ts` — add the equivalent `db.execute(sql\`...\`)` block.

`packages/db/src/schema/app.ts` — add Drizzle `conversations` table definition.

---

## Backend API

### Router: `apps/server/src/api/routers/conversations.py`

All endpoints require `CurrentUser` (401 if unauthenticated).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/conversations` | List caller's conversations, ordered by `updated_at DESC` |
| `POST` | `/conversations` | Create conversation; client supplies `id` (UUID) |
| `GET` | `/conversations/{id}/messages` | Return message history for a conversation |
| `PATCH` | `/conversations/{id}` | Rename title (ownership-checked, 404 if not found) |
| `DELETE` | `/conversations/{id}` | Delete conversation row + all `chat_sessions` rows |

**GET response:** `[{id, title, created_at, updated_at}]`

**POST body:** `{id: str}` — client generates the UUID. Returns `{id, title}`.

**PATCH body:** `{title: str}` — validated non-empty, max 200 chars.

**DELETE:** Returns 204. Deletes `chat_sessions WHERE session_id = id` first, then the conversation row.

### Auto-title in `ChatService.stream()`

After saving the first user message to `chat_sessions`, if the session maps to a conversation whose title is still `'New chat'`, fire a best-effort UPDATE:

```python
await pool.execute(
    "UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2 AND title = 'New chat'",
    message_text[:60],
    session_id,
)
```

This is conditional on `title = 'New chat'` so it's idempotent and won't overwrite manual renames. It does NOT block streaming.

On every chat turn (not just the first), bump `updated_at` so the sidebar stays sorted by recency:

```python
await pool.execute(
    "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
    session_id,
)
```

Both updates are fire-and-forget (wrapped in `try/except`, logged on failure).

### Registration

`apps/server/src/api/main.py` — import and `app.include_router(conversations.router)`.

---

## Frontend

### Routing change

| Before | After |
|--------|-------|
| `/chat` → `ChatPage` (ephemeral) | `/chat` → creates new conversation, redirects to `/chat/[id]` |
| — | `/chat/[id]` → `ChatPage` with `conversationId` from params |

`apps/web/src/app/chat/page.tsx` becomes a server component that calls `POST /api/conversations` (with a fresh `nanoid()`) and does `redirect(\`/chat/${id}\`)`.

`apps/web/src/app/chat/[id]/page.tsx` is the new chat page — passes `params.id` down to `ChatPage`.

### Layout

`apps/web/src/app/chat/layout.tsx` — two-column flex layout:

```tsx
<div className="flex h-screen">
  {isAuthenticated && <ConversationSidebar />}
  <main className="flex-1 overflow-hidden">{children}</main>
</div>
```

Server component — reads session to decide whether to render the sidebar.

### ConversationSidebar

`apps/web/src/features/chat/components/ConversationSidebar.tsx` — client component.

- Fetches `GET /api/conversations` on mount, refetches after create/rename/delete.
- Groups conversations by recency: **Today**, **Yesterday**, **This week**, **Older**.
- Active conversation highlighted via `usePathname()` matching `/chat/[id]`.
- **New chat** button at top: calls `POST /api/conversations`, navigates to new URL.
- Each row: click navigates; hover reveals a `⋯` menu with **Rename** and **Delete**.
  - **Rename**: row switches to an `<input>` inline; `Enter` or blur calls `PATCH /api/conversations/[id]`.
  - **Delete**: confirmation popover ("Delete this conversation?") then `DELETE /api/conversations/[id]`, navigates to a new conversation if the deleted one was active.
- Width: `w-60 shrink-0`, with a thin right border.

### ChatPage changes

`apps/web/src/features/chat/components/ChatPage.tsx` receives `conversationId: string` prop.

- Passes `conversationId` as `session_id` in the `DefaultChatTransport` body (replacing the hardcoded `"default"`).
- On mount, fetches existing messages from the server to restore history (using `initialMessages` on `useChat`).

### Next.js proxy routes

`apps/web/src/app/api/conversations/route.ts` — handles `GET` and `POST`.

`apps/web/src/app/api/conversations/[id]/route.ts` — handles `PATCH` and `DELETE`.

Both forward the session cookie to FastAPI. Same pattern as billing/admin proxy routes.

---

## Testing

### Python (`apps/server/tests/test_conversations.py`)

- `GET /conversations` returns only the authenticated user's conversations
- `GET /conversations` returns 401 without auth
- `POST /conversations` inserts a row and returns `{id, title}`
- `PATCH /conversations/{id}` updates title; returns 404 for non-existent ID
- `DELETE /conversations/{id}` removes row and chat_sessions rows

### Python (`apps/server/tests/test_chat_service_autotitle.py`)

- Auto-title fires on first message when title is `'New chat'`
- Auto-title does NOT fire on subsequent messages
- Auto-title does NOT overwrite a manually renamed title

---

## File Map

| File | Action |
|------|--------|
| `packages/db/migrations/0005_conversations.sql` | Create |
| `packages/db/src/schema/app.ts` | Modify — add conversations table |
| `packages/db/src/migrate.ts` | Modify — add conversations DDL |
| `apps/server/src/api/routers/conversations.py` | Create |
| `apps/server/src/api/main.py` | Modify — register router |
| `apps/server/src/api/services/chat_service.py` | Modify — auto-title + updated_at bump |
| `apps/server/tests/test_conversations.py` | Create |
| `apps/server/tests/test_chat_service_autotitle.py` | Create |
| `apps/web/src/app/chat/page.tsx` | Modify — redirect to new conversation |
| `apps/web/src/app/chat/[id]/page.tsx` | Create |
| `apps/web/src/app/chat/layout.tsx` | Create |
| `apps/web/src/app/api/conversations/route.ts` | Create |
| `apps/web/src/app/api/conversations/[id]/route.ts` | Create |
| `apps/web/src/features/chat/components/ConversationSidebar.tsx` | Create |
| `apps/web/src/features/chat/components/ChatPage.tsx` | Modify — accept conversationId prop |
