import { eq } from "drizzle-orm";
import { getDb } from "./client.js";
import { memoryEntries } from "./schema.js";

export class PgMemoryStore {
  constructor(private readonly sessionId: string) {}

  async add(entry: string): Promise<void> {
    await getDb()
      .insert(memoryEntries)
      .values({ sessionId: this.sessionId, content: entry });
  }

  async getAll(): Promise<string[]> {
    const rows = await getDb()
      .select({ content: memoryEntries.content })
      .from(memoryEntries)
      .where(eq(memoryEntries.sessionId, this.sessionId))
      .orderBy(memoryEntries.createdAt);
    return rows.map((r) => r.content);
  }
}
