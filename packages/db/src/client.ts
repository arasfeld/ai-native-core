import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/aicore";

let _db: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!_db) {
    const client = postgres(DATABASE_URL);
    _db = drizzle(client, { schema });
  }
  return _db;
}
