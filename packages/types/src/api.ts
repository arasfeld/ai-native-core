/**
 * Shared API types for the AI Native Core API.
 *
 * This file is generated from the FastAPI OpenAPI spec via:
 *   pnpm --filter @repo/types generate
 *
 * Do not edit manually — run the generate script after API changes.
 */

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  session_id?: string;
  use_rag?: boolean;
}

export interface ChatResponse {
  reply: string;
  session_id: string;
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

export interface IngestRequest {
  content: string;
  metadata?: Record<string, unknown>;
  chunk_size?: number;
  chunk_overlap?: number;
}

export interface IngestResponse {
  chunks_stored: number;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
}
