import type { RerankerProvider } from '../ports/reranker.provider';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3)
  );
}

function overlapScore(query: string, text: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return 0;
  const textTokens = tokenize(text);
  let matches = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) matches += 1;
  }
  return matches / queryTokens.size;
}

export class MockRerankerProvider implements RerankerProvider {
  readonly id = 'mock-reranker';
  readonly model: string;
  private readonly latencyMs: number;

  constructor(options: { model?: string; latencyMs?: number } = {}) {
    this.model = options.model || 'mock-bge-reranker-v2-m3';
    this.latencyMs = options.latencyMs ?? 0;
  }

  async rerank(query: string, texts: string[]): Promise<number[]> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    return texts.map((text) => overlapScore(query, text));
  }
}

