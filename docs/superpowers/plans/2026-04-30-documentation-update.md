# Documentation Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring README.md, ARCHITECTURE.md, and AGENTS.md into sync with the current codebase (phases 12–20 completed), establish clear non-overlapping doc ownership, and trim AGENTS.md for token efficiency.

**Architecture:** Three targeted rewrites — one per doc — with a clear ownership model: README for evaluators, ARCHITECTURE for engineers, AGENTS for AI assistants. No content is duplicated across docs; each references the others where depth is needed.

**Tech Stack:** Markdown only — no build step, no code changes.

---

### Task 1: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Fix the Structure code block**

In `README.md`, replace the `Structure` section code block:

Current:
```
apps/
  web/        Next.js frontend
  mobile/     Expo + React Native
  desktop/    Tauri desktop app
  server/     FastAPI server
  worker/     ARQ background jobs
  playground/ AI development sandbox

packages/     Shared TypeScript / frontend code
  ui/         Shared React components
  types/      TypeScript types (generated from OpenAPI)
  prompts/    Shared Jinja2 prompt templates
  db/         Postgres schema + migrations

services/     Python AI services
  ai/         LLM provider abstraction
  agents/     LangGraph agent workflows
  rag/        Chunking + pgvector retrieval
  tools/      Reusable agent tools
  memory/     Session + long-term memory
```

Replace with:
```
apps/
  web/        Next.js frontend + Tauri desktop shell (src-tauri/)
  mobile/     Expo + React Native
  server/     FastAPI server
  worker/     ARQ background jobs
  playground/ AI development sandbox
  extension/  Browser extension (WXT — Chrome + Firefox)

packages/     Shared TypeScript / frontend code
  ui/         Shared React components (shadcn/ui)
  types/      TypeScript types (generated from OpenAPI)
  auth/       better-auth config + shared client
  emails/     React Email templates (Resend)
  env/        Shared env schema + validation
  tokens/     Token counting utilities
  prompts/    Shared Jinja2 prompt templates
  db/         Postgres schema + migrations

services/     Python AI services
  ai/         LLM provider abstraction
  agents/     LangGraph agent workflows
  rag/        Chunking + pgvector retrieval
  tools/      Reusable agent tools
  memory/     Session + long-term memory
```

- [ ] **Step 2: Add a Features section**

Insert the following section between the `## Stack` table and `## Quick Start`. Add it as a new `## Features` heading:

```markdown
## Features

Everything you need to ship an AI product — included and working:

- **Multi-platform** — web (Next.js), mobile (Expo + React Native), desktop (Tauri), browser extension (WXT)
- **Auth** — email/password, Google + GitHub OAuth, email verification, 2FA/TOTP, session management, account deletion
- **RBAC** — roles, permissions, admin panel with user + tenant management, audit log
- **Organizations** — create/join orgs, member invitations, org roles (owner/admin/member), context switcher
- **Chat** — persistent conversation history, sidebar navigation, custom system instructions (global + per-conversation)
- **AI** — streaming chat (SSE), RAG (pgvector), multi-modal (image input, DALL-E, Whisper, TTS), tool calling, LangGraph agents
- **Billing** — Stripe subscriptions, per-tenant monthly token budgets, guest mode with 10k-token cap
- **Notifications** — transactional email (React Email + Resend), in-app notification center, budget alerts
- **User settings** — theme (dark/light/system), chat defaults, personal API key management
- **Background jobs** — ARQ worker for document ingestion and scheduled agent runs
```

- [ ] **Step 3: Verify the file looks correct**

Run: `head -100 README.md`

Confirm: Features section appears before Quick Start, structure block has no `desktop/` line and includes all 8 packages.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with features section and correct monorepo structure"
```

---

### Task 2: Update ARCHITECTURE.md §2 — directory tree and dependency rules

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Add missing packages to the §2 directory tree**

In `ARCHITECTURE.md`, find the `packages/` block inside the monorepo tree (around line 49–66). Replace it with:

```
├── packages/                   # Shared code (primarily TypeScript / frontend)
│   ├── auth/                   # better-auth config + shared client (web + extension)
│   │
│   ├── emails/                 # React Email templates (Resend)
│   │   └── src/emails/         # Welcome, invoice, billing alerts, security alerts
│   │
│   ├── env/                    # Shared env schema + validation (t3-env / zod)
│   │
│   ├── tokens/                 # Token counting utilities (shared TS)
│   │
│   ├── ui/                     # Shared React components (shadcn/ui base)
│   │   └── src/components/     # Button, Card, Chat, Message, etc.
│   │
│   ├── types/                  # Shared TypeScript types (generated from OpenAPI)
│   │   ├── src/api.ts          # API request/response types
│   │   └── openapi.yaml        # OpenAPI spec (source of truth for TS↔Python interop)
│   │
│   ├── prompts/                # Shared prompt library (Jinja2)
│   │   ├── src/prompts/
│   │   │   ├── system/         # Base system prompts
│   │   │   └── templates/      # Jinja2 templates
│   │   └── pyproject.toml
│   │
│   └── db/                     # Database schema + SQL migrations
│       ├── src/                # TypeScript Drizzle schema (for TS consumers)
│       ├── migrations/         # SQL files — usable from TS (Drizzle) and Python (raw SQL)
│       └── package.json
```

- [ ] **Step 2: Update the dependency rules section**

Find the `### Package / Service Dependency Rules` code block. Add these lines to the dependency listing:

```
apps/extension  → packages/auth, packages/ui
apps/web        → packages/ui, packages/types, packages/auth, packages/emails, packages/env, packages/tokens
packages/auth   → packages/db
packages/emails → (no internal deps)
packages/env    → (no internal deps)
packages/tokens → (no internal deps)
```

Replace the existing `apps/extension` and `apps/web` lines with the updated versions above, and add the four new `packages/*` lines.

The full updated block should read:

```
apps/extension  → packages/auth, packages/ui
apps/mobile     → packages/ui, packages/types
apps/playground → services/ai, services/agents, packages/prompts
apps/server     → services/ai, services/agents, services/rag, services/tools, services/memory, packages/prompts
apps/web        → packages/ui, packages/types, packages/auth, packages/emails, packages/env, packages/tokens
apps/worker     → services/agents, services/tools
services/agents → services/ai, services/tools, packages/prompts
services/ai     → (no internal deps — base layer)
services/memory → services/ai, services/rag
services/rag    → services/ai
services/tools  → services/ai (optional)
packages/auth   → packages/db
packages/db     → (no internal deps, SQL only)
packages/emails → (no internal deps)
packages/env    → (no internal deps)
packages/prompts → (no internal deps)
packages/tokens → (no internal deps)
packages/types  → (no internal deps, generated)
packages/ui     → (no internal deps)
```

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: add missing packages to ARCHITECTURE.md §2 structure and dependency rules"
```

---

### Task 3: Update ARCHITECTURE.md §11 — replace "Future Extensions" with "Extending the Template"

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Delete the existing §11 content**

Find the `## 11. Future Extensions` heading and everything below it to the end of the file. Delete it entirely.

- [ ] **Step 2: Replace with the new §11**

Append the following to the end of `ARCHITECTURE.md`:

```markdown
## 11. Extending the Template

This section covers how to add your own features on top of the existing stack.

### Adding a new LLM provider

1. Create `services/ai/src/ai/providers/<name>.py` implementing the `BaseLLM` protocol:

```python
# services/ai/src/ai/providers/myprovider.py
from ai.base import BaseLLM, Message, LLMResponse, Usage
from typing import AsyncIterator

class MyProvider(BaseLLM):
    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse:
        # call your provider SDK here
        ...

    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]:
        # yield token strings
        ...

    async def embed(self, text: str) -> list[float]:
        # return embedding vector
        ...
```

2. Register it in `services/ai/src/ai/factory.py`:

```python
case "myprovider": return MyProvider()
```

3. Add any required env vars to `packages/env/src/index.ts` using the existing pattern.

---

### Adding a new agent

1. Define a `StateGraph` in `services/agents/src/agents/<name>_agent.py`:

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage
import operator

class MyAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    session_id: str

async def agent_node(state: MyAgentState) -> MyAgentState:
    # call LLM, update state
    ...

def build_my_agent_graph(llm) -> StateGraph:
    graph = StateGraph(MyAgentState)
    graph.add_node("agent", agent_node)
    graph.set_entry_point("agent")
    graph.add_edge("agent", END)
    return graph.compile()
```

2. Add a system prompt template in `packages/prompts/src/prompts/system/<name>.j2`.

3. Expose via a thin FastAPI router in `apps/server/src/api/routers/<name>.py` following the Router → Service → Repository pattern (see §8).

---

### Adding a new tool

1. Create `services/tools/src/tools/<name>.py`:

```python
from pydantic import BaseModel, Field
from tools.base import tool_registry

class MyToolInput(BaseModel):
    query: str = Field(description="The query to process")

@tool_registry.register
async def my_tool(input: MyToolInput) -> str:
    """One-line description the LLM uses to decide when to call this tool."""
    # implement tool logic
    return result
```

Tools must: have a clear `description`, accept a Pydantic `BaseModel`, return a string, handle errors gracefully (return error string, never raise).

---

### Adding a new API route

Follow the three-layer pattern strictly:

```
Router (apps/server/src/api/routers/<feature>.py)
  → validates request, calls service, returns response
  → no business logic here

Service (apps/server/src/services/<feature>_service.py)
  → orchestrates business logic
  → no FastAPI imports — plain Python class

Repository (apps/server/src/repositories/<feature>_repository.py)
  → all DB access — parameterized queries only
  → no business logic here
```

If the Next.js frontend needs to call this route, add a proxy route in `apps/web/src/app/api/<feature>/route.ts` that forwards the request to the FastAPI server (see existing proxy routes for the pattern).

---

### Adding a new frontend feature

1. Create `apps/web/src/features/<feature-name>/` with:
   - `components/` — React components for this feature
   - `index.ts` — barrel export

2. Route files in `apps/web/src/app/` are thin shells:

```tsx
// apps/web/src/app/<feature>/page.tsx
import { FeaturePage } from "@/features/<feature-name>";
export default FeaturePage;
```

3. Add shared components to `packages/ui/src/components/` only if mobile or extension also needs them. Web-only components stay in `apps/web/src/features/`.
```

- [ ] **Step 3: Verify the section renders correctly**

Run: `grep -n "^## " ARCHITECTURE.md`

Expected output shows sections 1–11 with `## 11. Extending the Template` at the end. Confirm no stale references to "future" multi-tenancy, auth, or billing remain in §11.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: replace ARCHITECTURE.md §11 Future Extensions with Extending the Template guide"
```

---

### Task 4: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Replace the full directory tree in the Monorepo Structure section with a pointer + high-level list**

Find the `## Monorepo Structure` section. It currently contains a full directory tree. Replace it with:

```markdown
## Monorepo Structure

For the full directory tree and dependency rules, see **[ARCHITECTURE.md §2](./ARCHITECTURE.md#2-monorepo-structure)**.

```
apps/
  extension/  — Browser extension (WXT, Chrome + Firefox)
  mobile/     — Expo + React Native mobile app
  playground/ — AI development sandbox (prompt testing, agent debugging)
  server/     — FastAPI server
  web/        — Next.js frontend (Vercel AI SDK) + Tauri desktop shell (src-tauri/)
  worker/     — ARQ background job processor

packages/     — Shared code (primarily TypeScript / frontend)
  auth/       — better-auth config + shared client
  db/         — Database schema + SQL migrations (Drizzle ORM)
  emails/     — React Email templates (Resend)
  env/        — Shared env schema + validation
  prompts/    — Shared Jinja2 prompt templates
  tokens/     — Token counting utilities
  types/      — Shared TypeScript types (generated from OpenAPI spec)
  ui/         — Shared React components (shadcn/ui)

services/     — Python AI service layer
  agents/     — LangGraph agent workflows
  ai/         — Model abstraction (BaseLLM, provider factory)
  memory/     — Session + long-term memory
  rag/        — Ingestion + retrieval pipeline
  tools/      — Reusable agent tools
```
```

- [ ] **Step 2: Add a "What's already built" note**

Add the following section immediately before `## Roadmap`:

```markdown
## What's Already Built

Before scaffolding anything new, confirm it doesn't already exist:

**Auth:** email/password, Google + GitHub OAuth, email verification, 2FA/TOTP, session management, account deletion  
**Access control:** RBAC with roles/permissions, admin panel (user management, tenant management, audit log)  
**Organizations:** create/join orgs, member invitations, org roles (owner/admin/member), context switcher  
**Chat:** persistent conversation history with sidebar, custom system instructions (global + per-conversation)  
**User settings:** theme (dark/light/system), chat defaults, personal API key management  
**Billing:** Stripe subscriptions, per-tenant monthly token budgets, guest mode with 10k-token cap  
**Notifications:** transactional email (React Email + Resend), in-app notification center, budget alerts  
**AI:** streaming chat (SSE), RAG (pgvector), multi-modal (image input, DALL-E, Whisper, TTS), tool calling, LangGraph agents  
**Infrastructure:** rate limiting middleware, audit logging, ARQ background jobs, structured logging  
```

- [ ] **Step 3: Verify token efficiency**

Run: `wc -l AGENTS.md`

The file should be shorter than before (removed deep tree, added pointer). Confirm the `## Monorepo Structure` section no longer contains lines starting with `│` (tree characters).

Run: `grep "│" AGENTS.md`

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: slim AGENTS.md structure to pointer + add what's-already-built inventory"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All six success criteria from the spec have a corresponding task step
  - ✅ ARCHITECTURE.md directory tree matches actual `ls packages/` — Task 2 Step 1
  - ✅ ARCHITECTURE.md §11 has no "future" references for already-built features — Task 3 Step 3
  - ✅ AGENTS.md has no full tree (pointer only) — Task 4 Step 3
  - ✅ AGENTS.md feature inventory reflects phases 12–20 — Task 4 Step 2
  - ✅ README.md structure matches actual layout — Task 1 Step 1
  - ✅ README.md Features section — Task 1 Step 2
- [x] **No placeholders:** All steps include exact content to add or exact verification commands
- [x] **Type consistency:** N/A (documentation only — no types or method signatures)
- [x] **Out of scope respected:** No data flow diagram changes, no ROADMAP changes, no new package deep-dives
