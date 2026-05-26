import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { migrate } from "./migrate";

export async function reset(): Promise<void> {
  const db = getDb();
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO public`);
  await migrate();
}

const DATABASE_URL = process.env.DATABASE_URL ?? "<default>";
if (!process.env.ALLOW_DB_RESET && !DATABASE_URL.includes("localhost")) {
  console.error(
    `Refusing to reset non-local database (${DATABASE_URL}). Set ALLOW_DB_RESET=1 to override.`,
  );
  process.exit(1);
}

await reset();
console.log("Database reset complete.");
process.exit(0);
