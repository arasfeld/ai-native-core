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
import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(), // Keyed by better-auth user ID
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"), // "free" | "pro"
  tokenLimit: integer("token_limit").notNull().default(100_000),
  referralBonusTokens: integer("referral_bonus_tokens").notNull().default(0),
  // When set, the monthly budget is enforced in USD instead of tokens.
  costLimitUsd: numeric("cost_limit_usd", { precision: 10, scale: 4 }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerUserId: text("referrer_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  referredUserId: text("referred_user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  bonusGrantedAt: timestamp("bonus_granted_at", { withTimezone: true }),
});
