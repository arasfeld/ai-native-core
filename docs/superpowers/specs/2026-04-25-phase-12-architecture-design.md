# Phase 12 Architecture Design — AI Native Core

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Backend 3-layer refactor, tool calling integration, runtime AI config, feature-based frontend, SaaS isolation

---

## Context

`ai-native-core` is an internal monorepo template for building AI-native multi-platform applications. After 11 phases of development, the core runtime (providers, agents, memory, RAG, tools, eval) is feature-complete but has accumulated architectural debt in two areas:

1. **Backend coupling:** The chat router directly orchestrates memory, episodic search, location injection, compression, and agent invocation. This makes the router hard to test, hard to extend, and violates the principle that AI is a _consumer_ of services — not their owner.

2. **Missing capability:** The tool registry exists and is populated, but is wired to nothing. Agents cannot call tools.

Separately, a comparison with `maintenance-app` (a mature SaaS product built on similar patterns) identified two additional patterns worth porting:
- **Runtime AI config:** Per-feature model selection via DB, updatable without redeployment.
- **3-layer backend:** Router → Service → Repository, matching the `maintenance-app`'s clean separation.

The goal of Phase 12 is to address all of these in a single cohesive architectural cleanup, leaving the template in a state that's clean for use as a starting point for future AI SaaS products.

**Core philosophy (unchanged):** AI is the center of the system. Auth, tenancy, billing are optional infrastructure.

---

## 1. Monorepo Structure

No top-level restructuring. Changes are within `apps/server/` and `apps/web/`. SaaS tables are isolated in a new schema file.

```
apps/
  extension/          — WXT (Chrome + Firefox) [unchanged]
  mobile/             — Expo + React Native [unchanged]
  playground/         — AI dev sandbox [unchanged]
  server/             — FastAPI backend
    src/api/
      routers/        — Thin HTTP adapters
      services/       — ★ NEW: ChatService, ContextService
      repositories/   — ★ NEW: SessionRepository
      integrations/   — External services (LLM factory)
      auth/           — CurrentUser dependency
      agent_factory.py — ★ NEW: AgentFactory
      config.py
      main.py
  web/                — Next.js
    src/
      app/            — Route entry points only (no logic)
      features/       — ★ NEW: chat/, auth/, billing/, settings/
      components/     — Global UI (nav, layout)
      lib/            — Utilities
  worker/             — ARQ background jobs [unchanged]

packages/
  auth/               — better-auth [unchanged]
  db/
    src/schema/
      app.ts          — Core tables + ai_feature_configs ★ ADDITION
      auth.ts         — Auth tables [unchanged]
      saas.ts         — ★ NEW: tenants, billing (optional SaaS — delete to strip)
  env/                — Env var validation [unchanged]
  prompts/            — Jinja2 templates [unchanged]
  types/              — Generated TypeScript from OpenAPI [unchanged]
  ui/                 — Shared React + AI components [unchanged]

services/
  agents/             — LangGraph workflows ★ ENHANCED (tool node)
  ai/                 — BaseLLM + providers + per-feature factory ★ ENHANCED
  memory/             — session, episodic, compressor, budget, extractor [unchanged]
  rag/                — PgVectorRetriever (pooled ★ FIX), chunker, loaders
  tools/              — ToolRegistry + implementations [unchanged]
```

### Module Boundary Rules

| Module | May Depend On | Must NOT Depend On |
|---|---|---|
| `services/ai` | nothing internal | agents, memory, tools, server |
| `services/agents` | ai, prompts | memory, tools, server |
| `services/memory` | ai, asyncpg | agents, tools, server |
| `services/tools` | ai | agents, memory, server |
| `services/rag` | ai, asyncpg | agents, memory, server |
| `apps/server services/` | all services above | FastAPI (no framework imports) |
| `apps/server routers/` | server/services/ | memory/rag/ai directly |
| `apps/web features/` | @repo/types, @repo/ui | other features directly |

---

## 2. AI Runtime Architecture

### 2a. Runtime AI Config

**Problem:** The current LLM factory creates one global singleton from `LLM_PROVIDER` env var. There is no way to use different providers for different features (e.g., Anthropic for chat, Ollama for embeddings) or to update the model without redeployment.

**Solution:** Add `ai_feature_configs` table. Load into `app.state.ai_config` at startup. Update via admin endpoint without restarting.

**New table** (`packages/db/schema/app.ts`):
```sql
CREATE TABLE ai_feature_configs (
  feature   TEXT PRIMARY KEY,        -- 'chat' | 'rag' | 'embeddings' | 'image_gen' | 'memory'
  provider  TEXT NOT NULL,           -- 'ollama' | 'openai' | 'anthropic' | 'openrouter'
  model     TEXT,                    -- null = provider default
  enabled   BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Updated factory** (`services/ai/factory.py`):
```python
def get_llm(feature: str = "default") -> BaseLLM:
    """Returns a provider instance for the given feature.
    Falls back to LLM_PROVIDER env var if ai_feature_configs is not available.
    """
    config = _get_feature_config(feature)  # reads from app.state or env
    return _create_provider(config.provider, config.model)
```

**New admin endpoints** (`apps/server/src/api/routers/admin.py`):
- `GET /admin/ai-config` — returns full config map (requires `CurrentUser`; any authenticated user can read)
- `PUT /admin/ai-config/{feature}` — updates one feature config, refreshes `app.state.ai_config` (requires platform admin role; add `role: "admin"` field to `AuthUser` and enforce via dependency)

**Env var fallback:** `LLM_PROVIDER` continues to work for local dev without a database. If `ai_feature_configs` table is empty or unavailable, factory falls back to env var.

---

### 2b. Tool Calling (LangGraph Tool Node)

**Problem:** `services/tools/` has a `ToolRegistry` with `WeatherTool`, `WebSearchTool`, `NearbyPOITool`, `GenerateImageTool`, `ReverseGeocodeTool`. None of them are wired to any agent. Agents cannot call tools.

**Solution:** Add a conditional LangGraph tool node to `ChatAgent`. `AgentFactory` wires `registry.get_all()` into the graph at build time.

**Graph topology:**
```
ENTRY
  │
  ▼
agent_node          — calls LLM (with tools bound)
  │
  ├── tool_calls present? → YES → tools_node → agent_node (loop)
  │
  └── NO → END
```

**Provider compatibility note:** Tool calling requires provider support. OpenAI and Anthropic providers support it natively. Ollama support depends on the model (llama3.2 supports tool calling; older models do not). The `BaseLLM` protocol must add a `bind_tools(tools: list[BaseTool]) -> BaseLLM` method that each provider implements. If a provider does not support tool calling, it raises `NotImplementedError` (consistent with existing `transcribe`/`synthesize` pattern). `AgentFactory` falls back to a no-tools agent in that case.

**Key changes** (`services/agents/chat_agent.py`):
```python
def build_graph(
    llm: BaseLLM | None = None,
    tools: list[BaseTool] | None = None,
    system_prompt: str = "",
) -> CompiledGraph:
    _llm = llm or get_llm("chat")

    # Bind tools to LLM for structured tool call output.
    # Each provider implements bind_tools() in its own format
    # (OpenAI: function_calling, Anthropic: tool_use blocks).
    if tools:
        try:
            _llm_with_tools = _llm.bind_tools(tools)
        except NotImplementedError:
            _llm_with_tools = _llm  # provider doesn't support tools; runs without
            tools = []
    else:
        _llm_with_tools = _llm

    graph = StateGraph(ChatState)
    graph.add_node("agent", _make_agent_node(_llm_with_tools, system_prompt))
    graph.add_node("tools", ToolNode(tools or []))

    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        _should_continue,           # returns "tools" or END
        {"tools": "tools", END: END}
    )
    graph.add_edge("tools", "agent")
    return graph.compile()

def _should_continue(state: ChatState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END
```

**`AgentFactory`** (`apps/server/src/api/agent_factory.py`):
```python
class AgentFactory:
    def __init__(self, retriever: PgVectorRetriever):
        self._retriever = retriever

    def build(self, use_rag: bool = False) -> CompiledGraph:
        tools = registry.get_all()
        if use_rag:
            return build_rag_graph(llm=get_llm("rag"), retriever=self._retriever)
        return build_chat_graph(llm=get_llm("chat"), tools=tools)
```

**Extension point:** Domain apps add tools to the registry without modifying core agent code:
```python
# In a domain app's startup:
from tools import registry
registry.register(LookupTicketsTool())
registry.register(GetAssetHistoryTool())
```

---

### 2c. Memory (unchanged internals, new wrapping)

`services/memory/` modules (`session`, `episodic`, `compressor`, `budget`, `extractor`) are unchanged. They are wrapped by `ContextService` in the server layer rather than called procedurally in the chat router.

**Connection pooling fix** (`services/rag/retriever.py`): `PgVectorRetriever` is updated to accept an `asyncpg.Pool` parameter instead of opening per-call connections. The pool is passed from `app.state.pool` at startup.

---

## 3. Backend Architecture (3-Layer)

### Layers

**Router** — thin HTTP adapter. Validates request types, extracts auth, calls service, returns response. No SQL, no business logic, no direct memory calls.

**Service** — pure Python business logic. No FastAPI imports. Orchestrates repositories and external services. Fully testable without HTTP.

**Repository** — data access only. SQL lives here. Returns domain objects, not raw rows.

### Request Lifecycle

```
POST /chat (ChatRequest, Authorization header)
  │
  ▼
[routers/chat.py]
  - Extracts CurrentUser via Depends
  - Calls chat_service.stream(request, user)
  - Returns StreamingResponse
  │
  ▼
[services/chat_service.py: ChatService]
  - context = await context_service.build(request, user)
  - agent = agent_factory.build(use_rag=request.use_rag)
  - async for chunk in agent.stream(context): yield chunk
  - await session_repo.save_message(session_id, "assistant", full_reply)
  - await session_repo.add_token_usage(session_id, tokens, tenant_id)
  - asyncio.ensure_future(extractor.extract_and_store(...))
  │
  ▼
[services/context_service.py: ContextService]
  - Scopes session_id = f"{user.id}:{request.session_id}"
  - Checks token budget (TokenBudget)
  - history = await session_repo.get_messages(session_id)
  - messages = await compressor.compress(history)
  - facts = await episodic.search(request.message, top_k=5)
  - if request.lat and request.lng: inject location SystemMessage
  - Appends user message
  - Returns list[BaseMessage]
  │
  ▼
[agent_factory.py: AgentFactory]
  - Returns ChatAgent (with tools) or RAGAgent
  │
  ▼
[services/agents: LangGraph]
  - Streams tokens, optionally calls tools
```

### New Files

**`apps/server/src/api/services/chat_service.py`**
```python
class ChatService:
    """Orchestrates a complete chat turn. Pure Python, no FastAPI."""
    def __init__(
        self,
        context_service: ContextService,
        agent_factory: AgentFactory,
        session_repo: SessionRepository,
    ): ...

    async def stream(
        self, request: ChatRequest, user: AuthUser
    ) -> AsyncIterator[str]: ...
```

**`apps/server/src/api/services/context_service.py`**
```python
class ContextService:
    """Builds the full message context for a chat turn."""
    def __init__(
        self,
        session_repo: SessionRepository,
        compressor: SummaryCompressor,
        episodic: EpisodicStore,
        budget: TokenBudget,
    ): ...

    async def build(
        self, request: ChatRequest, user: AuthUser
    ) -> list[BaseMessage]: ...
```

**`apps/server/src/api/repositories/session_repository.py`**
```python
class SessionRepository:
    """All session data access. SQL lives here."""
    async def get_messages(self, session_id: str) -> list[Message]: ...
    async def save_message(self, session_id: str, role: str, content: str) -> None: ...
    async def add_token_usage(self, session_id: str, tokens: int, tenant_id: str) -> None: ...
```

### Two Request Paths

The 3-layer structure enforces the two-path model from requirements:

| Path | Uses | Bypasses |
|---|---|---|
| Traditional REST (`/users`, `/billing`) | Router → Service → Repository | AI runtime entirely |
| AI Runtime (`/chat`, `/ingest`) | Router → ChatService → Agent | Direct SQL (goes through repo) |

**Rule:** AI tools that need business data call repositories or services — never routers. Business services never import from agents or memory.

### Dependency Injection

Services created once at lifespan, injected via `Annotated[..., Depends(...)]`:
```python
# apps/server/src/api/deps.py
ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
ContextServiceDep = Annotated[ContextService, Depends(get_context_service)]
```

---

## 4. Frontend Architecture

### Feature-Based Structure

Pages are thin route entry points. All logic lives in `features/`:

```
apps/web/src/
  app/
    (auth)/
      login/page.tsx      → import { LoginPage } from "@/features/auth"
      register/page.tsx   → import { RegisterPage } from "@/features/auth"
    billing/page.tsx      → import { BillingPage } from "@/features/billing"
    chat/page.tsx         → import { ChatPage } from "@/features/chat"
    layout.tsx            — global layout, nav
    page.tsx              — landing / redirect

  features/
    auth/
      components/         — LoginForm, RegisterForm, AuthGuard
      hooks/              — useAuth, useSession
      actions/            — Next.js server actions
      index.ts
    billing/
      components/         — BillingDashboard, PricingCard, UsageBar
      hooks/              — useSubscription, useTokenUsage
      index.ts
    chat/
      components/         — ChatInterface, MessageList, InputBar
      hooks/              — useChat, useGeolocation
      types/              — ChatMessage, ChatSession
      api/                — typed fetch wrappers (from @repo/types)
      index.ts
    settings/
      components/         — ModelSelector, ProviderBadge
      hooks/              — useSettings
      index.ts

  components/             — global only: Nav, ThemeProvider, ErrorBoundary
  lib/                    — utils, cn(), formatters
```

### Rules

- `app/` files import from `features/` only — no logic, no direct hooks.
- `features/` files never import from other features — use `@repo/ui` or `@repo/types` for shared needs.
- API calls live in `features/*/api/` using typed wrappers from `@repo/types`. No raw `fetch` in components.
- `@repo/ui` remains home for generic AI components (MessageList, PromptInput, etc.). Feature-specific compositions live in `features/chat/components/`.

### Mobile (unchanged)

Expo file-based routing stays as-is. `@repo/ui` AI components used where React Native compatible. Mobile-specific hooks (`useLocation` via `expo-location`) stay in `apps/mobile/hooks/`.

---

## 5. Optional SaaS Module Isolation

The multi-tenancy and billing tables are moved from `packages/db/schema/app.ts` to a new `packages/db/schema/saas.ts` with a clear header comment:

```typescript
/**
 * Optional SaaS Module
 *
 * This file contains tables for multi-tenancy, token budgeting, and Stripe billing.
 * These are NOT required for core AI functionality.
 *
 * To strip SaaS features from a fork:
 *   1. Delete this file
 *   2. Delete apps/server/src/api/routers/billing.py
 *   3. Remove TokenBudget usage from ContextService
 *   4. Remove the `tenants` import from schema/index.ts
 */
```

Tables in `saas.ts`: `tenants`, `stripe_customers`, `stripe_subscriptions`, token usage tracking.

Core tables remain in `app.ts`: `memory_entries`, `document_chunks`, `ai_feature_configs`.

---

## 6. Keep / Remove / Refactor

### Keep (unchanged)
- `services/ai/` — BaseLLM, all 4 providers (factory is refactored, not removed)
- `services/memory/` — all 5 modules unchanged
- `services/tools/` — ToolRegistry + all tools (wired up, not changed)
- `services/rag/` — chunker, loaders (retriever is patched for pooling)
- `packages/prompts/` — versioned Jinja2 registry
- `packages/auth/` — better-auth
- `packages/types/` — OpenAPI codegen
- `packages/env/` — env var validation
- `packages/ui/` — all AI components
- `apps/mobile/` — unchanged
- `apps/worker/` — ARQ jobs unchanged
- `apps/extension/` — WXT unchanged
- `apps/playground/` — unchanged
- Multi-tenancy + billing — kept, isolated to `saas.ts`

### Refactor (changed, not deleted)

| What | Change |
|---|---|
| `apps/server/src/api/routers/chat.py` | Extract all orchestration → `ChatService`; router becomes ~30 lines |
| `services/ai/factory.py` | Add `get_llm(feature)` with per-feature config; env var fallback |
| `services/agents/chat_agent.py` | Add `tools` param, conditional `ToolNode`, `_should_continue` edge |
| `services/rag/retriever.py` | Accept asyncpg Pool instead of opening per-call connections |
| `packages/db/schema/app.ts` | Add `ai_feature_configs`; move SaaS tables to `saas.ts` |
| `apps/web/src/app/` | Page files become thin imports from features |
| `apps/web/src/` | Add `features/{chat,auth,billing,settings}/` |

### Remove
Nothing. The template is already lean.

---

## 7. Migration Plan (Phase 12)

Incremental, ~10 dev-days. Each step leaves the system deployable.

| Step | What | Days | Verification |
|---|---|---|---|
| 1 | Create `repositories/` — extract `SessionRepository` | 1–2 | Chat endpoint works |
| 2 | Create `services/` — extract `ContextService` + `ChatService` | 2–4 | Golden-answer eval suite passes |
| 3 | Runtime AI config — `ai_feature_configs` table + admin endpoints | 4–5 | Unit test factory; integration test provider selection |
| 4 | Tool calling — `ToolNode` in `ChatAgent`, wire registry | 5–7 | Assert WeatherTool called in eval for weather prompt |
| 5 | RAG pooling — pass `app.state.pool` to `PgVectorRetriever` | 7 | RAG endpoint works; no per-call connection opens |
| 6 | SaaS isolation — move tables to `saas.ts`, add header comment | 8 | `pnpm check-types` passes |
| 7 | Frontend restructure — `features/` dirs, thin pages | 8–10 | `pnpm check-types` + manual smoke test |
| 8 | Update docs — `ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT.md` | 10 | — |

---

## 8. Verification

End-to-end test checklist after Phase 12:

- [ ] `POST /chat` streams response with correct provider (per `ai_feature_configs`)
- [ ] `POST /chat` with weather question triggers `WeatherTool` call (visible in LangSmith trace)
- [ ] `GET /admin/ai-config` returns current config map
- [ ] `PUT /admin/ai-config/chat` updates provider without restart; next chat uses new provider
- [ ] Session history persists across requests (session store working)
- [ ] Episodic facts retrieved and injected into context (episodic store working)
- [ ] Location + weather injected when lat/lng provided
- [ ] `RUN_EVALS=1 uv run pytest` passes with ≥80% score
- [ ] `pnpm check-types` passes (no TS errors)
- [ ] `uv run ruff check .` passes (no Python lint errors)
- [ ] Chat page loads; messages stream; billing page loads; login/register works
- [ ] Mobile app builds and chat works
- [ ] Delete `saas.ts` + billing router → system still boots and chat works (SaaS truly optional)
