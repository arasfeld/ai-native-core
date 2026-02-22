export interface IEmbeddingModel {
  embed(text: string): Promise<number[]>;
}
