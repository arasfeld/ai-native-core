import type { IEmbeddingModel, IRetriever, RetrievedChunk } from "@repo/ai-core";
import { PgVectorStore } from "./pg-vector-store.js";

export class PgVectorRetriever implements IRetriever {
  constructor(
    private store: PgVectorStore,
    private embedder: IEmbeddingModel,
  ) {}

  async retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
    const embedding = await this.embedder.embed(query);
    return this.store.search(embedding, topK);
  }
}
