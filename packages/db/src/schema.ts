import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const memoryEntries = pgTable("memory_entries", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
