import { sql } from "drizzle-orm";
import { getDb } from "./client.js";

export interface VectorSearchResult {
  content: string;
  source?: string;
  score: number;
}

export class PgVectorStore {
  async insert(content: string, embedding: number[], source?: string): Promise<void> {
    const db = getDb();
    const vectorLiteral = `[${embedding.join(",")}]`;
    await db.execute(
      sql`INSERT INTO document_chunks (content, embedding, source)
          VALUES (${content}, ${vectorLiteral}::vector, ${source ?? null})`,
    );
  }

  async search(queryEmbedding: number[], topK = 5): Promise<VectorSearchResult[]> {
    const db = getDb();
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    const rows = await db.execute<{ content: string; source: string | null; score: number }>(
      sql`SELECT content, source, 1 - (embedding <=> ${vectorLiteral}::vector) AS score
          FROM document_chunks
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${topK}`,
    );
    return rows.map((row) => ({
      content: row.content,
      source: row.source ?? undefined,
      score: Number(row.score),
    }));
  }
}
