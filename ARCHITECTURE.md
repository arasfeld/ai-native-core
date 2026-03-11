# Architecture

AI Native Core is a production-ready monorepo template for building AI-native applications. It provides a complete stack from LLM abstraction to frontend, designed to be forked and adapted for client-facing AI products.

---

## 1. System Overview

### Purpose

AI Native Core is a **reusable template** for building AI-powered applications. The goal is to provide a well-structured starting point that handles the hard parts of AI integration — model abstraction, agent orchestration, RAG pipelines, tool calling, and streaming — so that product teams can focus on business logic.

### Design Philosophy

- **Intelligence as a system primitive** — AI is not an add-on; it's wired into every layer of the stack.
- **Local-first development** — everything runs locally via Docker + Ollama, no cloud credentials needed to get started.
- **Provider-agnostic** — swap between OpenAI, Anthropic, OpenRouter, or Ollama via a single env var.
- **Abstraction over convenience** — no direct SDK calls in app code; all model access goes through `packages/ai`.
- **Modularity** — packages have narrow responsibilities and clean dependency boundaries.

### Who It's For

Solo developers and small teams building AI-powered client products: chatbots, copilots, document Q&A, autonomous agents, and similar systems.

---

## 2. Monorepo Structure

```
ai-native-core/
├── apps/
│   ├── web/                    # Next.js (App Router) + Tailwind v4 + shadcn/ui + React Query
│   ├── api/                    # FastAPI — AI orchestration server (Python)
│   └── worker/                 # ARQ background job processor (Python)
│
├── packages/
│   ├── ai/                     # Python: model abstraction layer
│   │   ├── src/ai/
│   │   │   ├── base.py         # BaseLLM protocol / ABC
│   │   │   ├── factory.py      # get_llm() — selects provider from LLM_PROVIDER env
│   │   │   └── providers/      # openai.py, anthropic.py, openrouter.py, ollama.py
│   │   └── pyproject.toml
│   │
│   ├── agents/                 # Python: LangGraph agent workflows
│   │   ├── src/agents/
│   │   │   ├── base_agent.py   # Abstract StateGraph agent
│   │   │   ├── chat_agent.py   # Conversational agent
│   │   │   └── rag_agent.py    # RAG-augmented agent
│   │   └── pyproject.toml
│   │
│   ├── rag/                    # Python: ingestion + retrieval pipeline
│   │   ├── src/rag/
│   │   │   ├── ingest/         # Loaders (PDF, web, markdown, text)
│   │   │   ├── chunking.py     # Text splitters
│   │   │   ├── embeddings/     # Ollama (local) + OpenAI (hosted)
│   │   │   └── retriever.py    # PgVector retriever
│   │   └── pyproject.toml
│   │
│   ├── tools/                  # Python: reusable LangGraph-compatible tools
│   │   ├── src/tools/
│   │   │   ├── base.py         # Tool base class + registry
│   │   │   ├── web_search.py   # Tavily / SerpAPI
│   │   │   ├── email.py        # SendGrid / SMTP
│   │   │   ├── slack.py        # Slack Bolt
│   │   │   └── database.py     # SQL query tool
│   │   └── pyproject.toml
│   │
│   ├── prompts/                # Shared prompt library
│   │   ├── src/prompts/
│   │   │   ├── system/         # Base system prompts
│   │   │   └── templates/      # Jinja2 templates
│   │   └── pyproject.toml
│   │
│   ├── db/                     # Database schema + SQL migrations
│   │   ├── src/                # TypeScript Drizzle schema (for TS consumers)
│   │   ├── migrations/         # SQL files — usable from TS (Drizzle) and Python (raw SQL)
│   │   └── package.json
│   │
│   ├── ui/                     # Shared React components (shadcn/ui base)
│   │   └── src/components/     # Button, Card, Chat, Message, etc.
│   │
│   └── types/                  # Shared TypeScript types (generated from OpenAPI)
│       ├── src/api.ts          # API request/response types
│       └── openapi.yaml        # OpenAPI spec (source of truth for TS↔Python interop)
│
├── config/
│   ├── eslint/                 # Shared ESLint config
│   └── typescript/             # Shared tsconfig bases
│
├── scripts/                    # Dev scripts: setup, seed, migrate
├── docker-compose.yml          # Postgres/pgvector + Ollama
├── turbo.json                  # Task orchestration (TS + Python via uv run)
├── pnpm-workspace.yaml         # pnpm workspace config
├── pyproject.toml              # Root uv workspace (members: all Python packages)
└── .env.example
```

### Package Dependency Rules

```
apps/web        → packages/ui, packages/types
apps/api        → packages/ai, packages/agents, packages/rag, packages/tools, packages/prompts
apps/worker     → packages/agents, packages/tools
packages/agents → packages/ai, packages/tools, packages/prompts
packages/rag    → packages/ai
packages/tools  → packages/ai (optional)
packages/ai     → (no internal deps)
packages/db     → (no internal deps, SQL only)
packages/ui     → (no internal deps)
packages/types  → (no internal deps, generated)
```

**Rules:**
- No circular dependencies.
- `packages/ai` has no internal dependencies — it is the base layer.
- App code never imports directly from provider SDKs (openai, anthropic) — always via `packages/ai`.
- Python packages and TypeScript packages are independent; they communicate at runtime via HTTP (FastAPI ↔ Next.js).

### TypeScript ↔ Python Type Sharing

FastAPI auto-generates an OpenAPI spec at `/openapi.json`. The `packages/types` package uses `openapi-typescript` to generate TypeScript types from this spec. This is the source of truth for the API contract — no manual duplication.

```bash
# Regenerate types after API changes
pnpm --filter @repo/types generate
```

---

## 3. AI Architecture

### Model Abstraction Layer

All LLM access goes through `packages/ai`. The `BaseLLM` protocol defines the interface:

```python
# packages/ai/src/ai/base.py
from typing import Protocol, AsyncIterator
from pydantic import BaseModel

class Message(BaseModel):
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str

class LLMResponse(BaseModel):
    content: str
    usage: dict | None = None

class BaseLLM(Protocol):
    async def chat(self, messages: list[Message], **kwargs) -> LLMResponse: ...
    async def stream(self, messages: list[Message], **kwargs) -> AsyncIterator[str]: ...
    async def embed(self, text: str) -> list[float]: ...
```

### Provider Factory

The active provider is selected via the `LLM_PROVIDER` environment variable:

```python
# packages/ai/src/ai/factory.py
from .providers.openai import OpenAIProvider
from .providers.anthropic import AnthropicProvider
from .providers.openrouter import OpenRouterProvider
from .providers.ollama import OllamaProvider

def get_llm() -> BaseLLM:
    provider = os.environ.get("LLM_PROVIDER", "openai")
    match provider:
        case "openai":     return OpenAIProvider()
        case "anthropic":  return AnthropicProvider()
        case "openrouter": return OpenRouterProvider()
        case "ollama":     return OllamaProvider()
        case _:            raise ValueError(f"Unknown provider: {provider}")
```

Supported providers:

| Provider | `LLM_PROVIDER` | Required env vars |
|----------|---------------|-------------------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Ollama (local) | `ollama` | *(none)* |

### LangGraph Agents

Agents are defined as LangGraph `StateGraph`s. Each agent has:
- **State**: `TypedDict` with typed fields (messages, context, tool results, etc.)
- **Nodes**: Python async functions that transform state
- **Edges**: Conditional routing between nodes

```python
# packages/agents/src/agents/chat_agent.py (simplified)
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage
import operator

class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    session_id: str

def build_chat_graph(llm: BaseLLM) -> StateGraph:
    graph = StateGraph(ChatState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_use_tools, {
        "tools": "tools",
        END: END,
    })
    graph.add_edge("tools", "agent")
    return graph.compile()
```

### RAG Pipeline

```
Document Input
    ↓
[Loader] PDF / Web / Markdown / Text
    ↓
[Chunker] RecursiveCharacterTextSplitter (chunk_size=1000, overlap=200)
    ↓
[Embedder] Ollama (nomic-embed-text) or OpenAI (text-embedding-3-small)
    ↓
[PgVector Store] cosine similarity, 1536-dim vectors
    ↓
[Retriever] top-k chunks → context assembly
    ↓
[Agent] RAG-augmented system prompt
```

Embeddings are stored in the `document_chunks` table (Postgres + pgvector). The retriever uses cosine similarity search.

### Tool System

Tools are Pydantic-validated, LangGraph-compatible functions. Each tool:
1. Has a `name` and `description` (used by the LLM to decide when to call it).
2. Accepts a Pydantic `BaseModel` as input (validated automatically).
3. Returns a string result consumed by the agent.

```python
# packages/tools/src/tools/base.py
from pydantic import BaseModel
from langchain_core.tools import BaseTool

class ToolRegistry:
    _tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get_all(self) -> list[BaseTool]:
        return list(self._tools.values())
```

### Observability

- **LangSmith** tracing: set `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` to enable.
- **Structured logging**: all API requests/responses logged as JSON via Python `structlog`.
- **Token tracking**: usage metadata propagated through agent state and included in API responses.

---

## 4. Data Flow

### Chat (streaming)

```
User types message
    → Next.js sends POST /chat {message, session_id}
    → FastAPI router receives request
    → Loads session memory from Postgres
    → Retrieves RAG context (top-3 chunks)
    → Builds LangGraph ChatAgent with memory + context
    → Agent streams tokens via SSE (text/event-stream)
    → Next.js consumes SSE, updates UI incrementally
    → Final message saved to memory table
```

### RAG Ingestion

```
User uploads document (or API call with text)
    → POST /ingest {content, metadata}
    → FastAPI splits into chunks
    → Embedder converts chunks to vectors
    → PgVector stores chunks in document_chunks table
    → Returns {chunks_stored: N}
```

### Tool Call (within agent loop)

```
Agent receives LLM response with tool_call
    → LangGraph routes to tool node
    → Tool is looked up in ToolRegistry
    → Input validated via Pydantic
    → Tool executes (web search, DB query, etc.)
    → Result returned as tool message
    → Agent resumes with tool result in context
```

---

## 5. Local Development Workflow

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Python | ≥ 3.11 | [python.org](https://python.org) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker | latest | [docker.com](https://docker.com) |
| Ollama | latest | [ollama.com](https://ollama.com) |

### Setup

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-org/ai-native-core
cd ai-native-core

# 2. Copy env file and configure
cp .env.example .env
# Edit .env: set LLM_PROVIDER=ollama for local dev (no API keys needed)

# 3. Start infrastructure
docker compose up -d

# 4. Pull Ollama models (for local LLM + embeddings)
ollama pull llama3.2
ollama pull nomic-embed-text

# 5. Install all dependencies
pnpm install   # TypeScript packages
uv sync        # Python packages (reads root pyproject.toml workspace)

# 6. Run database migrations
pnpm --filter @repo/db migrate

# 7. Start all apps in development mode
pnpm dev
```

### Services

| Service | URL | Notes |
|---------|-----|-------|
| Web frontend | http://localhost:3000 | Next.js dev server |
| API | http://localhost:8000 | FastAPI with auto-reload |
| API docs | http://localhost:8000/docs | Swagger UI |
| Ollama | http://localhost:11434 | Local LLM inference |
| Postgres | localhost:5432 | pgvector enabled |

### Environment Variables

See `.env.example` for all variables. Key ones:

```bash
# Choose your LLM provider
LLM_PROVIDER=ollama          # ollama | openai | anthropic | openrouter

# Provider API keys (only needed for non-Ollama providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aicore

# Observability (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
```

---

## 6. Deployment Architecture

### Recommended Production Setup

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Vercel        │────▶│  Railway / Fly    │────▶│  Neon / Supabase │
│   (Next.js)     │     │  (FastAPI + ARQ)  │     │  (Postgres)      │
└─────────────────┘     └──────────────────┘     └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  OpenRouter      │
                         │  (multi-model)   │
                         └──────────────────┘
```

| Component | Provider | Notes |
|-----------|----------|-------|
| Frontend | [Vercel](https://vercel.com) | Zero-config Next.js deployment |
| API + Worker | [Railway](https://railway.app) or [Fly.io](https://fly.io) | Dockerfile in `apps/api/` |
| Database | [Neon](https://neon.tech) or [Supabase](https://supabase.com) | pgvector supported on both |
| LLM (prod) | [OpenRouter](https://openrouter.ai) | Pay-per-use, access to all major models |
| LLM (local) | [Ollama](https://ollama.com) | Self-hosted, GPU optional |

### Docker Deployment

```bash
# Build API image
docker build -t ai-native-api ./apps/api

# Run with env vars
docker run -p 8000:8000 --env-file .env ai-native-api
```

---

## 7. Coding Standards

### TypeScript

- Strict mode enabled; no `any`.
- Use `type` over `interface` for unions and mapped types; `interface` for object shapes extended by classes.
- Zod for all external data validation (API routes, tool inputs).
- `@repo/` prefix for internal workspace imports.
- camelCase for variables/functions, PascalCase for types/components.

### Python

- Python 3.11+ minimum; use `match` statements, `TypeAlias`, `Self`, etc.
- Type hints required on all function signatures.
- Pydantic `BaseModel` for all data models (request/response bodies, tool inputs, config).
- Ruff for linting and formatting (`ruff check . && ruff format .`).
- snake_case for variables/functions, PascalCase for classes.
- Async by default — use `async def` for all I/O-bound functions.

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Folders | kebab-case | `rag-pipeline/` |
| React components | PascalCase | `ChatMessage.tsx` |
| Python modules | snake_case | `chat_agent.py` |
| TypeScript variables | camelCase | `sessionId` |
| Python variables | snake_case | `session_id` |
| Environment variables | SCREAMING_SNAKE_CASE | `LLM_PROVIDER` |

### Critical Rules

- **Never import `openai`, `anthropic`, or other AI SDKs directly in app code.** Use `packages/ai`.
- **Never write raw SQL in agent/router code.** Use the Drizzle ORM (TS) or parameterized queries via `asyncpg`/`psycopg` (Python).
- **Never commit secrets.** Use `.env` locally; inject via platform env vars in production.

---

## 8. AI Development Standards

### Prompts

- All system prompts live in `packages/prompts/src/prompts/system/`.
- Use Jinja2 templates for variable injection — no inline f-strings in agent code.
- Version prompts by filename (e.g., `chat_v2.j2`); keep old versions until deprecated.

```python
# Good
from prompts.templates import render_template
system_prompt = render_template("system/chat.j2", {"user_name": user.name})

# Bad — inline prompt in agent code
system_prompt = f"You are a helpful assistant for {user.name}."
```

### Tools

- Must be Pydantic-validated: define `InputModel(BaseModel)` for every tool.
- Must have clear `name` and `description` strings — the LLM reads these to decide when to call.
- Should be idempotent where possible (especially for write operations).
- Must handle errors gracefully and return structured error messages (not raise exceptions).

### Agents

- Defined as LangGraph `StateGraph`s with `TypedDict` state.
- Test graph nodes in isolation before testing the full graph.
- Nodes should be pure functions where possible (state in → state out).
- Use `checkpointer` for long-running agents that need to pause/resume.

### Model Selection

- Default to cheapest capable model for each task:
  - Simple chat: `gpt-4o-mini` or `llama3.2` (Ollama)
  - Complex reasoning: `claude-sonnet-4-6` or `gpt-4o`
  - Embeddings: `nomic-embed-text` (Ollama) or `text-embedding-3-small` (OpenAI)
- Override per-task via agent config, not hardcoded in prompts.
- Set `temperature=0` for deterministic tool calls and classification.

### Cost Control

- Set token budget limits per session via agent config.
- Cache system prompts using provider prompt caching where available (Anthropic: `cache_control`).
- Log token usage on every response; alert if session exceeds budget.

---

## 9. Testing Strategy

### Python (pytest)

```bash
# Run all Python tests
uv run pytest

# Run specific package
uv run pytest packages/agents/tests/

# With coverage
uv run pytest --cov=src --cov-report=html
```

- Use `pytest-asyncio` for async tests.
- Mock LLM responses with fixtures — never make real API calls in tests.
- Use `respx` to mock HTTP calls (e.g., external tool APIs).

```python
# Example: mock LLM in agent test
@pytest.fixture
def mock_llm():
    llm = AsyncMock(spec=BaseLLM)
    llm.chat.return_value = LLMResponse(content="Hello!")
    return llm
```

### TypeScript (Vitest)

```bash
# Run all TS tests
pnpm test

# Run specific package
pnpm --filter @repo/ui test
```

- Mock `fetch` for API calls.
- Test React components with `@testing-library/react`.

### Agent Testing Strategy

1. **Unit test each node**: pass mock state in, assert state out.
2. **Integration test full graph**: mock the LLM, run the graph end-to-end.
3. **Golden-answer tests**: run with `temperature=0`, assert exact output matches expected.

### Tool Testing

- Unit test each tool with mocked external APIs.
- Test input validation — confirm Pydantic raises on invalid input.
- Test error handling — confirm tools return error strings, not exceptions.

### Prompt Testing

- Golden-answer tests: fixed input → fixed expected output (temperature=0).
- Store expected outputs as `.txt` files in `tests/fixtures/`.
- Run prompt tests in CI on every PR that modifies `packages/prompts/`.

---

## 10. Future Extensions

### Multi-tenancy

Add `tenant_id` (UUID) to all database tables. Enable Postgres row-level security:

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Authentication

- **Frontend**: NextAuth.js (supports OAuth, email/password, magic links)
- **Backend**: FastAPI-Users or a custom JWT middleware
- Session tokens passed as `Authorization: Bearer <token>` headers

### Billing

- Integrate Stripe for subscription plans.
- Track token usage per user/session in the `usage_events` table.
- Map token counts to cost using provider pricing tables.
- Expose usage dashboard in the frontend.

### Long-term Memory

- **Episode memory**: store conversation summaries as vector embeddings, retrieve relevant episodes.
- **Summary compression**: when session history exceeds token budget, summarize and compress older messages.
- **User preferences**: extract and persist user preferences from conversations as structured data.

### Background Jobs

ARQ (async Redis Queue) is used for background tasks:

```python
# apps/worker/tasks/ingest.py
async def ingest_document(ctx, document_url: str, tenant_id: str):
    """Background task: download, chunk, embed, store a document."""
    ...
```

Tasks are enqueued from the API and processed by `apps/worker`.

### Multi-modal

- Add image support: pass image URLs/base64 to providers that support vision (GPT-4o, Claude).
- Audio: Whisper transcription → text → agent pipeline.
- Structured outputs: use provider JSON mode or Instructor for reliable Pydantic extraction.
