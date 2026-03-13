import { sql } from "drizzle-orm";
import { getDb } from "./client";

export async function migrate(): Promise<void> {
  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user" (
      id              TEXT        PRIMARY KEY,
      name            TEXT        NOT NULL,
      email           TEXT        NOT NULL UNIQUE,
      "emailVerified" BOOLEAN     NOT NULL DEFAULT FALSE,
      image           TEXT,
      "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session (
      id              TEXT        PRIMARY KEY,
      "expiresAt"     TIMESTAMPTZ NOT NULL,
      token           TEXT        NOT NULL UNIQUE,
      "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "ipAddress"     TEXT,
      "userAgent"     TEXT,
      "userId"        TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS session_userId_idx ON session ("userId")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS account (
      id                        TEXT        PRIMARY KEY,
      "accountId"               TEXT        NOT NULL,
      "providerId"              TEXT        NOT NULL,
      "userId"                  TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "accessToken"             TEXT,
      "refreshToken"            TEXT,
      "idToken"                 TEXT,
      "accessTokenExpiresAt"    TIMESTAMPTZ,
      "refreshTokenExpiresAt"   TIMESTAMPTZ,
      scope                     TEXT,
      password                  TEXT,
      "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS account_userId_idx ON account ("userId")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS verification (
      id            TEXT        PRIMARY KEY,
      identifier    TEXT        NOT NULL,
      value         TEXT        NOT NULL,
      "expiresAt"   TIMESTAMPTZ NOT NULL,
      "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id                      TEXT        PRIMARY KEY,
      name                    TEXT        NOT NULL,
      plan                    TEXT        NOT NULL DEFAULT 'free',
      token_limit             INTEGER     NOT NULL DEFAULT 100000,
      stripe_customer_id      TEXT,
      stripe_subscription_id  TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      metadata JSONB NOT NULL DEFAULT '{}',
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
  `);
}
