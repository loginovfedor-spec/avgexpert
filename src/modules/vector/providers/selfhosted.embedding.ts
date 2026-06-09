import type { EmbeddingProvider } from '../ports/embedding.provider';

type SelfHostedOptions = {
  id?: string;
  model: string;
  dimensions: number;
  apiUrl: string;
  apiFormat?: 'tei' | 'custom';
  queryPrefix?: string;
  timeoutMs?: number;
};

type EmbedApiResponse = {
  embeddings?: number[][];
  embedding?: number[];
  data?: Array<{ embedding: number[] }>;
};

function extractCustomEmbeddings(payload: EmbedApiResponse, expectedCount: number): number[][] {
  if (Array.isArray(payload.embeddings)) {
    return payload.embeddings;
  }
  if (Array.isArray(payload.data)) {
    return payload.data.map(item => item.embedding);
  }
  if (Array.isArray(payload.embedding)) {
    if (expectedCount !== 1) {
      throw new Error('SelfHostedEmbeddingProvider: batch embed ожидает поле embeddings');
    }
    return [payload.embedding];
  }
  throw new Error('SelfHostedEmbeddingProvider: неподдерживаемый формат ответа embed API');
}

function extractTeiEmbeddings(payload: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(payload)) {
    throw new Error('SelfHostedEmbeddingProvider (tei): ожидался массив векторов');
  }
  if (payload.length !== expectedCount) {
    throw new Error(
      `SelfHostedEmbeddingProvider (tei): ожидалось ${expectedCount} векторов, получено ${payload.length}`
    );
  }
  return payload as number[][];
}

function assertDimensions(vectors: number[][], dimensions: number): void {
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error(
        `SelfHostedEmbeddingProvider: ожидалось ${dimensions} измерений, получено ${vector.length}`
      );
    }
  }
}

export class SelfHostedEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly model: string;
  private readonly apiUrl: string;
  private readonly apiFormat: 'tei' | 'custom';
  private readonly queryPrefix: string;
  private readonly timeoutMs: number;

  constructor(options: SelfHostedOptions) {
    this.id = options.id || 'self-hosted';
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.apiFormat = options.apiFormat || 'tei';
    this.queryPrefix = options.queryPrefix
      ?? 'Represent this sentence for searching relevant passages: ';
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  private buildRequestBody(texts: string[]): { body: string; headers: Record<string, string> } {
    if (this.apiFormat === 'tei') {
      return {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inputs: texts.length === 1 ? texts[0] : texts,
        }),
      };
    }
    return {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts, model: this.model }),
    };
  }

  private parseResponse(payload: unknown, expectedCount: number): number[][] {
    if (this.apiFormat === 'tei') {
      return extractTeiEmbeddings(payload, expectedCount);
    }
    return extractCustomEmbeddings(payload as EmbedApiResponse, expectedCount);
  }

  private async postEmbeddings(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const { body, headers } = this.buildRequestBody(texts);
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      const payload = await response.json() as EmbedApiResponse & { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
      }
      const vectors = this.parseResponse(payload, texts.length);
      assertDimensions(vectors, this.dimensions);
      return vectors;
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.postEmbeddings(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.postEmbeddings([`${this.queryPrefix}${text}`]);
    return vector;
  }
}

module.exports = { SelfHostedEmbeddingProvider };
