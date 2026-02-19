# AI Core — Reusable AI Runtime

**`ai-core`** is the heart of the **AI Native Core** monorepo.
It provides the reusable AI runtime engine that powers agents, tools, memory, retrieval, and multi-model orchestration.

This package is **framework-agnostic** and is designed to be imported by both the API server and frontend applications.

---

## 📦 Responsibilities

- **Model Abstraction** — Unified interface for OpenAI, Anthropic, and future models
- **Context Assembly** — Dynamically inject system prompts, tools, and memory into model calls
- **Tool Execution** — Typed, schema-validated, hot-pluggable tool system
- **Retrieval (RAG)** — Pgvector-backed embeddings and hybrid search
- **Memory System** — Persist and retrieve long-term user and system insights
- **Agent Runtime** — Structured execution loops with tool integration
- **Event Handling** — Background agents and event-driven memory updates

---

## 🏗 Project Structure

```
packages/ai-core/
├── agents/          # Agent logic and orchestration loops
├── context/         # Context assembly, prompt injection, policies
├── memory/          # Memory persistence, summarization, decay
├── models/          # Multi-model abstraction & streaming interfaces
├── retrieval/       # Embedding, search, indexing logic
├── tools/           # Tool registry and execution
├── runtime/         # Agent runtime loop, output parsing, tool execution
├── events/          # Event bus and background agent execution
├── types/           # Shared TypeScript interfaces & schemas
├── package.json
└── README.md
```

---

## ⚡ Key Concepts

### 1️⃣ Model Abstraction

- Wraps model SDKs (OpenAI, Anthropic, etc.)
- Provides consistent `stream()` and `generate()` APIs
- Supports **fallbacks**, retries, and structured output validation

```ts
interface AIModel {
  stream(context: ModelContext): AsyncIterable<ModelChunk>;
  generate(context: ModelContext): Promise<ModelResult>;
}
```

---

### 2️⃣ Context System

- Loads memory, retrieves embeddings, injects system instructions and tools
- Enforces token budgets
- Returns structured context for model reasoning

---

### 3️⃣ Tool System

- Each tool defines:

```ts
{
  name: string;
  description: string;
  schema: ZodSchema;
  execute: (input: any) => Promise<any>;
}
```

- Hot-pluggable, strictly typed, validated
- Enables safe tool calls within agent loops

---

### 4️⃣ Memory & RAG

- **Memory**: Tracks user insights, conversation summaries, system reflections
- **RAG**: Batched embeddings, namespaces, hybrid search
- Designed to evolve over time as AI interacts with users

---

### 5️⃣ Agent Runtime

- Generic loop for agent execution:
  1. Call model
  2. Detect tool calls
  3. Execute tool
  4. Append result
  5. Call model again
  6. Return structured output

- Supports streaming, structured JSON, and retries

---

### 6️⃣ Event System

- **Event bus** for emitting and listening to events
- Background agents respond asynchronously
- Example:

```
eventBus.emit("drink_logged", payload)
→ memory updated
→ background agent schedules follow-up
```

---

## 🚀 Development

From the monorepo root:

```bash
pnpm --filter @ai-native-core/ai-core dev
```

---

## 🧠 Design Philosophy

- **Intelligence is a system primitive** — don’t treat AI as a feature
- **Deterministic output** — always validate against schemas
- **Streaming-first** — agents, memory, and tools are reactive
- **Multi-model support** — fallback and abstraction built-in
- **Long-term memory** — system evolves over repeated interactions

---

## 🔮 Roadmap

- Structured prompt injection system
- Advanced memory decay and summarization strategies
- Hybrid RAG with multiple sources
- Observable tool execution & debugging tools
- Full integration with `apps/api` streaming endpoints
- AI-native patterns for React and React Native frontends

---

This README positions `ai-core` as a **production-ready, reusable AI runtime engine** that can evolve with multiple products while staying consistent and maintainable.
