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
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// Runtime AI configuration — one row per feature, updated without redeployment.
// `fallbackProviders` is an ordered list of {provider, model?} objects; on a
// transient error from the primary, services/ai walks the chain in order.
export const aiFeatureConfigs = pgTable("ai_feature_configs", {
  feature: text("feature").primaryKey(), // 'chat' | 'rag' | 'embeddings' | 'image_gen' | 'memory'
  provider: text("provider").notNull(), // 'ollama' | 'openai' | 'anthropic' | 'openrouter'
  model: text("model"), // null = provider default
  enabled: boolean("enabled").notNull().default(true),
  fallbackProviders: jsonb("fallback_providers")
    .$type<Array<{ provider: string; model?: string | null }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Per-model unit pricing (USD per 1M tokens). Seeded with public list prices
// in migration 0018; admins can override via PUT /admin/pricing (sets
// `isOverride = true` so re-seeds skip the row).
export const modelPricing = pgTable(
  "model_pricing",
  {
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputUsdPerMtok: numeric("input_usd_per_mtok", {
      precision: 12,
      scale: 6,
    }).notNull(),
    outputUsdPerMtok: numeric("output_usd_per_mtok", {
      precision: 12,
      scale: 6,
    }).notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.model] }),
    index("model_pricing_provider_idx").on(table.provider),
  ],
);

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

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sourceUrl: text("source_url"),
    sizeBytes: integer("size_bytes"),
    status: text("status").notNull().default("processing"),
    errorMessage: text("error_message"),
    chunksCount: integer("chunks_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("documents_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("documents_user_id_idx").on(table.userId),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
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
    index("document_chunks_document_id_idx").on(table.documentId),
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
