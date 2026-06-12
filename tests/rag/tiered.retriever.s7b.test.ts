import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asMock } from '../helpers/cast';
import type { VectorStore } from '../../src/modules/vector/ports/vector.store';

const DIMS = 64;

function makeStore(namespace: string, hits: Array<{
  id: string;
  body: string;
  score: number;
  metadata?: Record<string, unknown>;
}>) {
  return {
    id: 'mock-store',
    async search() {
      return hits.map((hit) => ({
        id: hit.id,
        namespace,
        scope: 'global' as const,
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

test('TieredRetriever expert: cross-encoder rerank reorders candidates', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { MockRerankerProvider } = await import('../../src/modules/vector/providers/mock.reranker');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s7b-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const reranker = new MockRerankerProvider();
  const store = makeStore(namespace, [
    { id: 'vector-top', body: 'unrelated finance report', score: 0.95, metadata: { doc_type: 'note' } },
    { id: 'rerank-win', body: 'reactor safety shutdown procedure manual', score: 0.80, metadata: { doc_type: 'canonical_book' } },
    { id: 'mid-1', body: 'misc', score: 0.79, metadata: {} },
    { id: 'mid-2', body: 'misc 2', score: 0.78, metadata: {} },
    { id: 'mid-3', body: 'misc 3', score: 0.77, metadata: {} },
    { id: 'mid-4', body: 'misc 4', score: 0.76, metadata: {} },
    { id: 'mid-5', body: 'misc 5', score: 0.75, metadata: {} },
  ]);

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace, reranker);
  const result = await retriever.retrieveWithTiming('reactor safety shutdown', {
    userId: 'user-a',
    tier: 'expert',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.chunks[0].id, 'rerank-win');
  assert.ok((result.rerankMs ?? 0) >= 0);
});

test('TieredRetriever consultant: skips reranker path', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { MockRerankerProvider } = await import('../../src/modules/vector/providers/mock.reranker');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s7b-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const reranker = new MockRerankerProvider();
  const store = makeStore(namespace, [
    { id: 'vector-top', body: 'finance', score: 0.95 },
    { id: 'rerank-win', body: 'reactor safety shutdown', score: 0.70 },
  ]);

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace, reranker);
  const result = await retriever.retrieveWithTiming('reactor safety shutdown', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.chunks[0].id, 'vector-top');
  assert.equal(result.rerankMs, 0);
});
