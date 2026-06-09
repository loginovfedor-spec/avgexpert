import crypto = require('crypto');
import type { EmbeddingProvider } from '../ports/embedding.provider';

function seededVector(text: string, dimensions: number): number[] {
  const hash = crypto.createHash('sha256').update(text).digest();
  const values: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    const byte = hash[i % hash.length];
    values.push((byte / 255) * 2 - 1);
  }
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
  return values.map(v => v / norm);
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly model: string;

  constructor(options: { id?: string; model?: string; dimensions: number }) {
    this.id = options.id || 'mock';
    this.model = options.model || 'mock-embedder';
    this.dimensions = options.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(text => seededVector(text, this.dimensions));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([`query:${text}`]);
    return vector;
  }
}
