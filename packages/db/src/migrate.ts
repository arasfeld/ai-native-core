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
  await db.execute(sql`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await db.execute(sql`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await db.execute(sql`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMPTZ
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permissions (
      id          TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS roles (
      id          TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_roles (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      org_id     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_roles_unique UNIQUE NULLS NOT DISTINCT (user_id, role_id, org_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles (user_id)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      org_id        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_permissions_unique UNIQUE NULLS NOT DISTINCT (user_id, permission_id, org_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_permissions_user_idx ON user_permissions (user_id)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      title       TEXT        NOT NULL DEFAULT 'New chat',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name         TEXT        NOT NULL,
      key_hash     TEXT        NOT NULL UNIQUE,
      key_prefix   TEXT        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys(user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_api_keys_key_hash_idx ON user_api_keys(key_hash)
  `);
}
