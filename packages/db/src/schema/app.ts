import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// Runtime AI configuration — one row per feature, updated without redeployment.
export const aiFeatureConfigs = pgTable("ai_feature_configs", {
  feature: text("feature").primaryKey(), // 'chat' | 'rag' | 'embeddings' | 'image_gen' | 'memory'
  provider: text("provider").notNull(), // 'ollama' | 'openai' | 'anthropic' | 'openrouter'
  model: text("model"), // null = provider default
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memoryEntries = pgTable("memory_entries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New chat"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("user_api_keys_user_id_idx").on(table.userId),
    index("user_api_keys_key_hash_idx").on(table.keyHash),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").notNull().default({}),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("document_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const messageFeedback = pgTable(
  "message_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    sessionId: text("session_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_feedback_run_id_idx").on(table.runId),
    index("message_feedback_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    index("message_feedback_session_idx").on(table.sessionId),
    check("message_feedback_rating_check", sql`rating IN (-1, 1)`),
  ],
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commitSha: text("commit_sha").notNull(),
    branch: text("branch"),
    category: text("category").notNull(),
    scorer: text("scorer").notNull(),
    passCount: integer("pass_count").notNull(),
    totalCount: integer("total_count").notNull(),
    score: numeric("score", { precision: 5, scale: 4 }).notNull(),
    threshold: numeric("threshold", { precision: 5, scale: 4 }),
    langsmithRunUrl: text("langsmith_run_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("eval_runs_category_created_idx").on(table.category, table.createdAt),
    index("eval_runs_scorer_created_idx").on(table.scorer, table.createdAt),
  ],
);
