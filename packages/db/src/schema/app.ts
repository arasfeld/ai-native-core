import { bigint, bigserial, integer, pgTable, serial, text, timestamp, vector } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),           // "free" | "pro"
  tokenLimit: integer("token_limit").notNull().default(100_000),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memoryEntries = pgTable("memory_entries", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
