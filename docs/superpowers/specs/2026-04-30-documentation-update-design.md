# Documentation Update — Design Spec

**Date:** 2026-04-30  
**Scope:** README.md, ARCHITECTURE.md, AGENTS.md

---

## Goal

Bring the three primary project docs into sync with the current state of the codebase (phases 12–20 completed), establish clear non-overlapping ownership between each doc, and optimize `AGENTS.md` for token efficiency.

---

## Doc Ownership Model

| Doc | Audience | Purpose |
|-----|----------|---------|
| `README.md` | New visitors / evaluators | First impression — stack, features, quick start |
| `ARCHITECTURE.md` | Engineers building on the template | Deep reference — structure, patterns, standards |
| `AGENTS.md` | AI coding assistants | Behavior guide — conventions, rules, what to avoid |

These docs should not duplicate each other. `AGENTS.md` references `ARCHITECTURE.md` for structure; `README.md` references `ARCHITECTURE.md` for depth.

---

## 1. README.md Changes

### 1a. Fix `Structure` code block

Current state has `apps/desktop/` as a top-level directory — it doesn't exist. Tauri lives inside `apps/web/src-tauri/`.

**Change:** Update the `apps/web` entry to note the Tauri shell, remove the standalone `apps/desktop/` line.

### 1b. Add missing packages

Add to the `packages/` section:

```
packages/
  auth/       better-auth config + shared client (web + extension)
  emails/     React Email templates (welcome, invoice, billing alerts)
  env/        Shared env schema + validation
  tokens/     Token counting utilities
  ui/         Shared React components (shadcn/ui)
  types/      TypeScript types (generated from OpenAPI)
  prompts/    Shared Jinja2 prompt templates
  db/         Postgres schema + migrations
```

### 1c. Add "Features" section

Insert a brief bullet list between the stack table and Quick Start covering what's included out of the box. This helps evaluators quickly assess fit without reading ARCHITECTURE.md.

**Content:**
- Multi-platform: web (Next.js), mobile (Expo), desktop (Tauri), browser extension (WXT)
- Auth: email/password, Google + GitHub OAuth, email verification, 2FA/TOTP, session management, account deletion
- RBAC: roles, permissions, admin panel with user + tenant management, audit log
- Organizations: create/join orgs, member invitations, org roles (owner/admin/member), context switcher
- Chat: persistent conversation history, sidebar navigation, custom system instructions (global + per-conversation)
- AI: streaming chat (SSE), RAG (pgvector), multi-modal (image input, DALL-E, Whisper, TTS), tool calling, LangGraph agents
- Billing: Stripe subscriptions, per-tenant monthly token budgets, guest mode with token cap
- Notifications: transactional email (Resend + React Email), in-app notification center, budget alerts
- User settings: theme, chat defaults, API key management
- Background jobs: ARQ worker (document ingestion, agent runs)

---

## 2. ARCHITECTURE.md Changes

### 2a. §2 Monorepo Structure — directory tree

Add the four missing packages to the `packages/` section of the tree:

```
packages/
  auth/       # better-auth config + shared client
  emails/     # React Email templates (Resend)
  env/        # Shared env schema + validation (t3-env / zod)
  tokens/     # Token counting utilities
  ui/         # Shared React components (shadcn/ui base)
  types/      # Shared TypeScript types (generated from OpenAPI)
  prompts/    # Shared prompt library (Jinja2)
  db/         # Database schema + SQL migrations
```

### 2b. §2 Dependency rules

Add the new packages to the dependency rules table:

```
packages/auth    → packages/db (session schema)
packages/emails  → (no internal deps)
packages/env     → (no internal deps)
packages/tokens  → (no internal deps)
apps/web         → packages/ui, packages/types, packages/auth, packages/emails, packages/env, packages/tokens
apps/extension   → packages/auth, packages/ui
```

### 2c. §11 — Replace "Future Extensions" with "Extending the Template"

Replace the entire section with a practical how-to guide. The old section described auth, billing, multi-tenancy, etc. as future work — all of these are now fully built. The new section should help engineers add their own features on top of the template.

**New §11 structure:**

#### Adding a new LLM provider
- Implement `BaseLLM` protocol in `services/ai/src/ai/providers/`
- Register it in `factory.py` with a new `LLM_PROVIDER` value
- Add required env vars to `packages/env`

#### Adding a new agent
- Define a `StateGraph` with `TypedDict` state in `services/agents/src/agents/`
- Wire tools via `bind_tools()` on the LLM
- Add a system prompt template in `packages/prompts/src/prompts/system/`
- Expose via a thin FastAPI router in `apps/server/src/api/routers/`

#### Adding a new tool
- Define `InputModel(BaseModel)` with field descriptions
- Implement the tool function returning a string result
- Register in `ToolRegistry` in `services/tools/src/tools/base.py`

#### Adding a new API route
- Follow the Router → Service → Repository pattern
- Router: thin — validate request, call service, return response
- Service: orchestrate business logic, no FastAPI imports
- Repository: all DB access — parameterized queries only
- Add proxy route in `apps/web/src/app/api/` if the Next.js frontend needs it

#### Adding a new frontend feature
- Create `apps/web/src/features/<feature-name>/` with components + `index.ts` barrel
- Route files in `apps/web/src/app/` are thin shells that import from the feature directory
- Add shared components to `packages/ui/` only if mobile or extension also needs them

---

## 3. AGENTS.md Changes

### 3a. Slim the Monorepo Structure section

Replace the full directory tree with:

> For the full monorepo structure and dependency rules, see **[ARCHITECTURE.md §2](./ARCHITECTURE.md#2-monorepo-structure)**.

Keep the high-level mental model list (apps / packages / services with one-liners) since agents need this without loading a separate file. Remove the deep tree — it duplicates ARCHITECTURE.md verbatim and burns tokens on every session.

### 3b. Update feature inventory

Replace the "Phases 1–8 complete" note with a plain-English summary of what's built, so agents don't try to scaffold things that already exist:

> **What's already built:** auth (email/password, OAuth, 2FA/TOTP, session management), RBAC (roles/permissions, admin panel), organizations (teams, invites, org roles), chat history (persistent conversations, sidebar, custom system instructions), user settings (theme, API keys), email notifications (React Email + Resend), billing (Stripe, token budgets), RAG, multi-modal (image/audio), background jobs (ARQ), rate limiting, audit log.

---

## Success Criteria

- `ARCHITECTURE.md` directory tree matches `ls apps/ packages/ services/`
- `ARCHITECTURE.md §11` contains no references to "future" work that is already implemented
- `AGENTS.md` does not contain a full directory tree (pointer only)
- `AGENTS.md` feature inventory reflects phases 12–20 completed
- `README.md` structure section matches actual repo layout
- `README.md` includes a "Features" section

---

## Out of Scope

- Updating data flow diagrams (§5 in ARCHITECTURE.md) — current diagrams are still accurate at the protocol level
- Documenting new packages in depth (auth, emails, env, tokens) — that's ARCHITECTURE.md §3 expansion, a separate task
- Updating `ROADMAP.md` — already kept current after each phase
