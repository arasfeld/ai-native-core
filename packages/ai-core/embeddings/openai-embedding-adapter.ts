import OpenAI from "openai";
import type { IEmbeddingModel } from "./embedding-interface";

const defaultModel = "text-embedding-3-small";

export class OpenAIEmbeddingAdapter implements IEmbeddingModel {
  private client: OpenAI;
  private model: string;

  constructor(options: { model?: string; baseURL?: string; apiKey?: string } = {}) {
    this.model = options.model ?? defaultModel;
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "ollama";
    const baseURL = options.baseURL ?? process.env.OPENAI_BASE_URL;
    this.client = new OpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
    });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0]!.embedding;
  }
}
