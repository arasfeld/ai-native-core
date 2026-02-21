# AGENTS.md

Canonical project context for all AI coding assistants (Claude Code, Gemini CLI, Cursor, Copilot, Windsurf, etc.).

## Project Overview

AI Native Core is a production-ready monorepo template for building AI-native applications. It emphasizes intelligence as a system primitive, multi-model support, and a structured tool execution system.

- **Monorepo Manager:** [Turborepo](https://turbo.build/)
- **Package Manager:** [pnpm](https://pnpm.io/)
- **Core AI Engine:** `packages/ai-core` (Framework-agnostic AI runtime)
- **Frontend:** [Next.js](https://nextjs.org/) (React 19)
- **Backend:** [Fastify](https://www.fastify.io/) (Node.js)
- **Type Safety:** [Zod](https://zod.dev/) for schema validation and tool definitions.

## Monorepo Structure

- `apps/web`: Next.js frontend application.
- `apps/api`: Fastify AI orchestration server.
- `packages/ai-core`: Central AI runtime including agents, tools, memory, and model abstractions.
- `packages/ui`: Shared React components.
- `packages/config-eslint`: Shared ESLint configurations.
- `packages/config-typescript`: Shared TypeScript configurations.

## Building and Running

### Prerequisites

- Node.js >= 18
- pnpm

### Commands

- **Install dependencies:** `pnpm install`
- **Development mode (all apps):** `pnpm dev`
- **Build all projects:** `pnpm build`
- **Type checking:** `pnpm check-types`
- **Linting:** `pnpm lint`
- **Format code:** `pnpm format`

To run a specific app or package:
`pnpm --filter <package-name> <command>`
Example: `pnpm --filter @repo/ai-core dev`

## Development Conventions

### AI Logic

- **Framework Agnosticism:** Core AI logic (agents, tool definitions, model wrappers) MUST reside in `packages/ai-core`.
- **Typed Tools:** Every tool must have a Zod schema for input validation.
- **Streaming-First:** Design interfaces to support streaming by default.
- **Model Abstraction:** Use the unified `AIModel` interface in `packages/ai-core/models` instead of direct SDK calls in apps.

### General

- **Internal Imports:** Use the `@repo/` prefix for internal workspace packages (e.g., `@repo/ui`, `@repo/ai-core`).
- **Validation:** Use Zod for all external data boundaries (API requests, tool inputs).
- **Styling:** The project uses Vanilla CSS in `apps/web` (standard Next.js template).
- **Shared Config:** Ensure new packages extend the base configs in `packages/config-typescript` and `packages/config-eslint`.

## Tech Stack Details

- **Frontend:** Next.js (App Router), React 19.
- **Backend:** Fastify, `tsx` for development.
- **AI Core:** TypeScript-first, Zod-heavy.
- **Infrastructure:** Turborepo for task orchestration and caching.

## Roadmap

See **[ROADMAP.md](./ROADMAP.md)** for a unified, prioritized roadmap (real model adapter, streaming, context/memory wiring, then RAG, observability, and background agents).
