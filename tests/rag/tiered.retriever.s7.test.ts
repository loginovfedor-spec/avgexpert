import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asMock } from '../helpers/cast';
import type { VectorStore } from '../../src/modules/vector/ports/vector.store';

const DIMS = 64;

function makeStore(namespace: string, hitsByScope: Record<string, Array<{
  id: string;
  body: string;
  score: number;
  metadata?: Record<string, unknown>;
}>>) {
  return {
    id: 'mock-store',
    searchedTopK: [] as number[],
    async search(params: {
      topK?: number;
      filter?: { scope?: string };
    }) {
      this.searchedTopK.push(params.topK || 0);
      const scope = params.filter?.scope || 'global';
      return (hitsByScope[scope] || []).map((hit) => ({
        id: hit.id,
        namespace,
        scope,
        body: hit.body,
        score: hit.score,
        metadata: hit.metadata || {},
      }));
    },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };
}

test('TieredRetriever expert: topK=7 with metadata-weighted reorder', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s7-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const store = makeStore(namespace, {
    global: [
      { id: 'low-meta', body: 'low', score: 0.91, metadata: { doc_type: 'note' } },
      { id: 'high-meta', body: 'high', score: 0.88, metadata: { doc_type: 'canonical_book', domain_tags: ['reactor'] } },
      { id: 'mid-1', body: 'm1', score: 0.87, metadata: {} },
      { id: 'mid-2', body: 'm2', score: 0.86, metadata: {} },
      { id: 'mid-3', body: 'm3', score: 0.85, metadata: {} },
      { id: 'mid-4', body: 'm4', score: 0.84, metadata: {} },
      { id: 'mid-5', body: 'm5', score: 0.83, metadata: {} },
      { id: 'mid-6', body: 'm6', score: 0.82, metadata: {} },
    ],
  });

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace);
  const result = await retriever.retrieveWithTiming('reactor safety', {
    userId: 'user-a',
    tier: 'expert',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.chunks.length, 7);
  assert.equal(result.chunks[0].id, 'high-meta');
  assert.ok(store.searchedTopK[0] >= 21);
});

test('TieredRetriever sage: topK=12 with recency-aware scoring', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s7-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const recentDate = new Date().toISOString();
  const hits = Array.from({ length: 14 }, (_, i) => ({
    id: `chunk-${i}`,
    body: `body ${i}`,
    score: i === 13 ? 0.9 : 0.95 - i * 0.005,
    metadata: i === 13
      ? { doc_type: 'report', indexed_at: recentDate, domain_tags: ['analysis'] }
      : { doc_type: 'note', indexed_at: '2020-01-01T00:00:00.000Z' },
  }));

  const store = makeStore(namespace, { global: hits });
  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace);
  const result = await retriever.retrieveWithTiming('analysis report', {
    userId: 'user-a',
    tier: 'sage',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.chunks.length, 12);
  assert.equal(result.chunks[0].id, 'chunk-13');
  assert.ok(store.searchedTopK[0] >= 36);
});

test('TieredRetriever consultant: no metadata rescoring path', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s7-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const store = makeStore(namespace, {
    global: [
      { id: 'plain-high', body: 'plain', score: 0.95, metadata: { doc_type: 'note' } },
      { id: 'meta-low', body: 'meta', score: 0.80, metadata: { doc_type: 'canonical_book' } },
    ],
  });

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace);
  const result = await retriever.retrieveWithTiming('query', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.chunks[0].id, 'plain-high');
  assert.equal(store.searchedTopK[0], 3);
});
