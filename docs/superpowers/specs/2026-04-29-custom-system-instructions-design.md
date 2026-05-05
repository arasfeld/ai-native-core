# Custom System Instructions Design

**Goal:** Let users set a persistent global system prompt (stored in `user_preferences`) and a per-conversation system prompt (stored on `conversations`), resolved server-side in `ChatService` by appending both to any request-provided prompt.

**Tech Stack:** PostgreSQL, FastAPI, Next.js App Router, React, shadcn/ui Textarea

---

## Schema

New migration `packages/db/migrations/0009_user_preferences_conv_instructions.sql`:

```sql
CREATE TABLE user_preferences (
  user_id             TEXT        PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  system_instructions TEXT        NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations
  ADD COLUMN system_instructions TEXT NOT NULL DEFAULT '';
```

`user_preferences` uses a single row per user with explicit columns — new preferences land as `ALTER TABLE user_preferences ADD COLUMN` in future migrations. No key-value pattern.

---

## Resolution

`ChatService.stream()` fetches both instruction sources after the budget check, combines them, and passes the result to `AgentFactory.build()`:

```python
parts = filter(None, [global_instructions, conv_instructions, request.system_prompt])
effective_system_prompt = "\n\n".join(parts)
```

Precedence (additive, not replacing): **global → per-conversation → request-provided**. Any empty parts are skipped.

For guests (`is_guest=True`), skip the DB fetches — guests have no preferences row and no named conversations.

---

## FastAPI

### New router: `apps/server/src/api/routers/preferences.py`

```
GET  /preferences        → { system_instructions: str }
PUT  /preferences        → { system_instructions: str }  (upsert)
```

Both require auth (`CurrentUser`). `PUT` upserts the `user_preferences` row:
```sql
INSERT INTO user_preferences (user_id, system_instructions, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (user_id) DO UPDATE
SET system_instructions = EXCLUDED.system_instructions, updated_at = NOW()
```

### Modified: `apps/server/src/api/routers/conversations.py`

`PATCH /conversations/{id}` gains an optional `system_instructions: str | None` field on `PatchConversationRequest`. When present, it's written to `conversations.system_instructions`. `GET /conversations` response includes `system_instructions` on each item.

### Modified: `apps/server/src/api/services/chat_service.py`

Two private helpers added:

```python
async def _fetch_global_instructions(self, user_id: str) -> str:
    row = await self._session_repo._pool.fetchrow(
        "SELECT system_instructions FROM user_preferences WHERE user_id = $1", user_id
    )
    return row["system_instructions"] if row else ""

async def _fetch_conversation_instructions(self, conversation_id: str, user_id: str) -> str:
    if conversation_id == "default":
        return ""
    scoped_id = f"{user_id}:{conversation_id}"
    # conversation_id is already the raw ID (before scoping); look up by user_id
    row = await self._session_repo._pool.fetchrow(
        "SELECT system_instructions FROM conversations WHERE id = $1 AND user_id = $2",
        conversation_id, user_id
    )
    return row["system_instructions"] if row else ""
```

Called in `stream()` after the budget check, before `AgentFactory.build()`.

### Modified: `apps/server/src/api/main.py`

Register `preferences` router. Add `user_preferences` table creation to lifespan DDL.

---

## Next.js Proxy Routes

- `GET /api/preferences` → `GET {API_URL}/preferences`
- `PUT /api/preferences` → `PUT {API_URL}/preferences` (forward JSON body)

Both require auth (session check before proxying). The existing `PATCH /api/conversations/[id]` route already proxies to FastAPI — no change needed there.

---

## Web UI

### Settings page: new "AI" tab

`apps/web/src/features/settings/components/AiTab.tsx` — fetches `GET /api/preferences` on mount, renders a `<Textarea>` labelled "Global system instructions", saves on blur or explicit Save button via `PUT /api/preferences`.

`SettingsPage.tsx` gains a new `TabsTrigger value="ai"` → `TabsContent` rendering `<AiTab />`. `VALID_TABS` array updated to include `"ai"`.

### Chat: per-conversation instructions panel

`apps/web/src/features/chat/components/ConversationInstructions.tsx` — a collapsible panel rendered below the conversation title bar (only when `conversationId !== "default"` and user is logged in). Contains a `<Textarea>` for per-conversation instructions. On blur, fires `PATCH /api/conversations/{id}` with `{ system_instructions }`.

`chat.tsx` receives the current conversation's `system_instructions` from the sidebar data and passes it as `initialInstructions` to `ConversationInstructions`.

---

## Testing

`apps/server/tests/test_preferences.py`:
1. `GET /preferences` returns `{ system_instructions: "" }` for a new user (no row yet)
2. `PUT /preferences` upserts and returns the saved value
3. `PUT /preferences` twice — second call updates, doesn't duplicate
4. `GET /preferences` requires auth (401 without session)

`apps/server/tests/test_system_instructions.py`:
1. `PATCH /conversations/{id}` with `system_instructions` persists the value
2. `GET /conversations` returns `system_instructions` on each item
3. `ChatService._fetch_global_instructions` returns empty string when no row exists
4. `ChatService._fetch_conversation_instructions` returns empty string for `"default"` conversation
5. Resolution combines non-empty parts with `"\n\n"` separator
6. Empty parts are omitted (no leading/trailing `\n\n`)
