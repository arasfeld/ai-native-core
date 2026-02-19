# AI Native Core --- API

This is the Fastify-based API server for the **ai-native-core**
monorepo.

It is responsible for:

- AI orchestration
- Agent runtime execution
- Tool execution
- Memory & retrieval coordination
- Streaming model responses
- Event-driven background processing

This server is intentionally framework-light and AI-first.

---

## 🏗 Tech Stack

- Fastify --- high-performance Node.js server
- TypeScript --- strict typing across the stack
- Turborepo --- monorepo build orchestration
- Node 20+
- Designed for integration with:
  - OpenAI
  - Anthropic
  - PostgreSQL (with pgvector)

---

## 📁 Project Structure

    apps/api
    ├── src/
    │   └── server.ts
    ├── package.json
    ├── tsconfig.json
    └── README.md

As the AI runtime evolves, this structure will expand to include:

    src/
      routes/
      plugins/
      middleware/
      ai/

---

## 🚀 Development

From the monorepo root:

pnpm --filter @ai-native-core/api dev

Or inside this directory:

pnpm dev

The server runs on:

http://localhost:3000

Test endpoint:

GET /

Returns:

```json
{ "hello": "world" }
```

---

## 🛠 Available Scripts

Inside `apps/api`:

- pnpm dev --- Run with tsx (watch mode)
- pnpm build --- Compile to dist/
- pnpm start --- Run compiled build
- pnpm typecheck --- Type check only

---

## 🎯 Purpose of This API

This is not a typical CRUD API.

It is being built as an **AI-native orchestration layer**, which means:

- AI models will influence control flow
- Tool calls will be executed dynamically
- Structured outputs will be validated
- Context will be assembled programmatically
- Memory will be persisted for long-term intelligence

Future routes will include:

POST /ai/chat\
POST /ai/run-agent\
POST /events

---

## 🧠 Design Philosophy

This server follows AI-native principles:

1.  Intelligence is a system primitive, not a feature.
2.  Model outputs are validated and versioned.
3.  Tool execution is typed and observable.
4.  Memory is persisted and retrievable.
5.  Streaming is first-class.

The goal is to create a reusable AI-native backend template that can
power multiple products.

---

## 📦 Deployment (Planned)

The production build compiles to:

dist/server.js

Run with:

node dist/server.js

---

## 🔮 Roadmap

Upcoming additions:

- AI model abstraction layer
- Tool registry system
- RAG retrieval layer
- Memory persistence
- Streaming endpoints
- Background event agents
- Observability + token tracking
