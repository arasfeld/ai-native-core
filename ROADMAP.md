# AI Native Core — Roadmap

This roadmap unifies the direction from the root README, `packages/ai-core` README, and GEMINI.md. Items are ordered by impact and dependency where possible.

---

## Current state (as of this roadmap)

- **Done:** Monorepo (Turborepo + pnpm), ai-core package, typed tool registry + Zod, agent runtime loop with tool execution, minimal memory store, context assembler, event bus, Fastify API with `/chat` (non-streaming), stub model, example weather tool.
- **Not wired:** Context assembler and memory are not used by the agent runtime or API. No real LLM adapter, no RAG, no streaming from API.

---

## Phase 1 — Make the loop real and streaming

Goal: A single request through the API uses a real model and streams; context and memory can be used.

| Priority | Item | Notes |
|----------|------|--------|
| 1 | **Real OpenAI (and/or Anthropic) adapter** | Implement `AIModel` with actual SDK; keep stub for tests. Enables real tool-calling and streaming. |
| 2 | **Streaming `/chat` endpoint** | Use `model.stream()` and Fastify streaming (e.g. `reply.raw`, SSE or NDJSON). Aligns with “streaming-first” in GEMINI. |
| 3 | **Wire context + memory into runtime** | Agent accepts optional `systemPrompt` / `memory`; use `assembleContext()` (or equivalent) so system prompt includes memory and tool list. API passes memory from a `MemoryStore` (or later DB). |
| 4 | **Tool call argument parsing** | Parse and validate tool-call `arguments` (string or object) with each tool’s Zod schema before `execute()`. |

---

## Phase 2 — Persistence and retrieval

Goal: Memory and RAG are real, not in-memory only.

| Priority | Item | Notes |
|----------|------|--------|
| 5 | **Memory persistence** | Replace in-memory `MemoryStore` with a persistent backend (e.g. Postgres table or `packages/db`). API/agents read/write memory per user/session. |
| 6 | **RAG with pgvector** | Add `packages/ai-core/retrieval`: embeddings (e.g. OpenAI), pgvector store, hybrid search. Optional namespace/tenant. |
| 7 | **Context uses RAG** | Context assembler injects retrieved chunks into system or user context; token budget as in ai-core README. |

---

## Phase 3 — Observability and robustness

| Priority | Item | Notes |
|----------|------|--------|
| 8 | **Observability and token tracking** | Log/model token usage, latency, tool calls; optional metrics (e.g. OpenTelemetry) and debugging hooks. |
| 9 | **Structured prompt injection** | Reusable prompt fragments, policies, and token budgeting in `context/`. |
| 10 | **Memory decay and summarization** | Strategies for pruning/summarizing long-term memory (per ai-core README). |

---

## Phase 4 — Scale and product

| Priority | Item | Notes |
|----------|------|--------|
| 11 | **Background agents / event-driven** | Use event bus so that e.g. `drink_logged` triggers memory update or follow-up agent. |
| 12 | **Frontend integration** | Streaming UI in Next.js app; optional AI-native patterns for React/React Native. |
| 13 | **Hybrid RAG and multi-source** | Multiple retrievers or sources; advanced RAG patterns. |

---

## Maintenance and docs

- **GEMINI.md:** Optionally add a “Roadmap” section that points to this file.
- **README.md:** Replace the short roadmap list with a link to `ROADMAP.md` and a one-line summary of Phase 1.
- **packages/ai-core/README.md:** Point “Roadmap” to this file or a short summary so there’s a single source of truth.

---

## Suggested “next most valuable” focus

1. **Real model adapter** — Unblocks real tool use and streaming; highest leverage.
2. **Streaming `/chat`** — Delivers the promised streaming-first experience.
3. **Wire context + memory** — Makes existing assembler and memory actually affect model behavior.

After that, memory persistence and RAG (Phase 2) will make the system production-ready for stateful, retrieval-augmented flows.
