import { sql } from "drizzle-orm";
import { getDb } from "./client.js";

export async function migrate(): Promise<void> {
  const db = getDb();
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
}
