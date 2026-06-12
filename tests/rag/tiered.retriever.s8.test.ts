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

test('TieredRetriever expert: domain_tags filter removes off-domain tagged hits', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s8-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const store = makeStore(namespace, {
    global: [
      { id: 'reactor', body: 'reactor', score: 0.82, metadata: { domain_tags: ['reactor'] } },
      { id: 'finance', body: 'finance', score: 0.95, metadata: { domain_tags: ['finance'] } },
      { id: 'plain-1', body: 'p1', score: 0.8, metadata: {} },
      { id: 'plain-2', body: 'p2', score: 0.79, metadata: {} },
      { id: 'plain-3', body: 'p3', score: 0.78, metadata: {} },
      { id: 'plain-4', body: 'p4', score: 0.77, metadata: {} },
      { id: 'plain-5', body: 'p5', score: 0.76, metadata: {} },
      { id: 'plain-6', body: 'p6', score: 0.75, metadata: {} },
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
  assert.ok(!result.chunks.some((chunk) => chunk.id === 'finance'));
  assert.ok(result.chunks.some((chunk) => chunk.id === 'reactor'));
});

test('TieredRetriever sage: semantic graph expansion when enabled', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');
  const { SemanticGraphService } = await import('../../src/modules/semantic/semantic-graph.service');

  const namespace = `rag-s8-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const store = makeStore(namespace, {
    global: [
      { id: 'seed-0', body: 'seed 0', score: 0.9, metadata: { entity_ids: ['node-a'] } },
      { id: 'seed-1', body: 'seed 1', score: 0.5, metadata: {} },
      { id: 'seed-2', body: 'seed 2', score: 0.4, metadata: {} },
    ],
  });

  const semanticGraph = new SemanticGraphService({
    async getNeighborChunkIds() {
      return [{ chunkId: 'expanded-1', nodeId: 'node-b', weight: 1 }];
    },
    async getChunksByIds() {
      return [{
        id: 'expanded-1',
        namespace,
        scope: 'global' as const,
        body: 'expanded chunk',
        score: 0,
        metadata: { graph_expanded: true },
      }];
    },
  } as never, namespace);

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace, null, semanticGraph);
  const result = await retriever.retrieveWithTiming('analysis', {
    userId: 'user-a',
    tier: 'sage',
    scopes: ['global'],
    globalKbEnabled: true,
    semanticGraphEnabled: true,
  });

  assert.ok(result.chunks.some((chunk) => chunk.id === 'expanded-1'));
});
