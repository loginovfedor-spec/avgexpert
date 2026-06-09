export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
