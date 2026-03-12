import { sql } from "drizzle-orm";
import { getDb } from "./client.js";

export async function migrate(): Promise<void> {
  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id                      BIGSERIAL   PRIMARY KEY,
      name                    TEXT        NOT NULL,
      plan                    TEXT        NOT NULL DEFAULT 'free',
      token_limit             INTEGER     NOT NULL DEFAULT 100000,
      stripe_customer_id      TEXT,
      stripe_subscription_id  TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id         BIGSERIAL   PRIMARY KEY,
      tenant_id  BIGINT      NOT NULL REFERENCES tenants(id),
      email      TEXT        NOT NULL UNIQUE,
      password   TEXT        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_session_id ON memory_entries(session_id)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(1536),
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
  `);
}
