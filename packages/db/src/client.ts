import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/aicore";

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });

// Alias for callers using the old getDb() API
export function getDb() {
  return db;
}
