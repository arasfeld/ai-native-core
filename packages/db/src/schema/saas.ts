/**
 * Optional SaaS Module
 *
 * Contains tables for multi-tenancy, token budgeting, and Stripe billing.
 * These are NOT required for core AI functionality.
 *
 * To strip SaaS features from a fork:
 *   1. Delete this file
 *   2. Delete apps/server/src/api/routers/billing.py
 *   3. Remove check_budget calls from ContextService / SessionRepository
 *   4. Remove `export * from "./schema/saas"` from schema.ts
 */
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(), // Keyed by better-auth user ID
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"), // "free" | "pro"
  tokenLimit: integer("token_limit").notNull().default(100_000),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
