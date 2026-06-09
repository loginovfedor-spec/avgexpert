export interface RerankerProvider {
  readonly id: string;
  readonly model: string;
  rerank(query: string, texts: string[]): Promise<number[]>;
}

module.exports = {};
