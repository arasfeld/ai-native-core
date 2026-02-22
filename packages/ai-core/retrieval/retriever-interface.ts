export interface RetrievedChunk {
  content: string;
  source?: string;
  score: number;
}

export interface IRetriever {
  retrieve(query: string, topK?: number): Promise<RetrievedChunk[]>;
}
