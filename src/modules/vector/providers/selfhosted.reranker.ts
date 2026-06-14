import type { RerankerProvider } from '../ports/reranker.provider';

type SelfHostedRerankerOptions = {
  id?: string;
  model: string;
  apiUrl: string;
  timeoutMs?: number;
};

type TeiRerankItem = {
  index: number;
  score: number;
};

function normalizeScores(items: TeiRerankItem[], expectedCount: number): number[] {
  const scores = new Array(expectedCount).fill(0);
  for (const item of items) {
    if (item.index >= 0 && item.index < expectedCount) {
      scores[item.index] = item.score;
    }
  }
  return scores;
}

export class SelfHostedRerankerProvider implements RerankerProvider {
  readonly id: string;
  readonly model: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(options: SelfHostedRerankerOptions) {
    this.id = options.id || 'self-hosted-reranker';
    this.model = options.model;
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async rerank(query: string, texts: string[]): Promise<number[]> {
    if (texts.length === 0) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          texts,
          truncate: true,
        }),
        signal: controller.signal,
      });

      const payload = await response.json() as TeiRerankItem[] | { error?: string; message?: string };
      if (!response.ok) {
        const err = !Array.isArray(payload) ? payload : {};
        throw new Error(err.error || err.message || `HTTP ${response.status}`);
      }
      if (!Array.isArray(payload)) {
        throw new Error('SelfHostedRerankerProvider: ожидался массив {index, score}');
      }
      return normalizeScores(payload, texts.length);
    } finally {
      clearTimeout(timer);
    }
  }
}

