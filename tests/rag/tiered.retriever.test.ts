import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asMock } from '../helpers/cast';
import type { VectorStore } from '../../src/modules/vector/ports/vector.store';

const DIMS = 64;

test('TieredRetriever consultant: topK=3 and scopes filter', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `rag-s3-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });

  const store = {
    id: 'mock-store',
    async search(params: {
      topK?: number;
      filter?: { scope?: string | string[]; ownerUserId?: string; sessionId?: string };
    }) {
      const scope = Array.isArray(params.filter?.scope)
        ? params.filter.scope[0]
        : params.filter?.scope;

      if (scope === 'global') {
        return [
          { id: 'g1', namespace, scope: 'global', body: 'global chunk 1', score: 0.9, metadata: { title: 'G1' } },
          { id: 'g2', namespace, scope: 'global', body: 'global chunk 2', score: 0.8, metadata: { title: 'G2' } },
          { id: 'g3', namespace, scope: 'global', body: 'global chunk 3', score: 0.7, metadata: { title: 'G3' } },
          { id: 'g4', namespace, scope: 'global', body: 'global chunk 4', score: 0.6, metadata: { title: 'G4' } },
        ];
      }

      if (scope === 'user' && params.filter?.ownerUserId === 'user-a') {
        return [
          { id: 'u1', namespace, scope: 'user', body: 'user-a chunk', score: 0.95, metadata: { title: 'UA' } },
        ];
      }

      if (scope === 'user' && params.filter?.ownerUserId === 'user-b') {
        return [
          { id: 'u2', namespace, scope: 'user', body: 'user-b chunk', score: 0.85, metadata: { title: 'UB' } },
        ];
      }

      return [];
    },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace);

  const globalResult = await retriever.retrieveWithTiming('query', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(globalResult.chunks.length, 3);
  assert.equal(globalResult.chunks[0].id, 'g1');

  const userAResult = await retriever.retrieveWithTiming('query', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['user'],
    globalKbEnabled: false,
  });

  assert.equal(userAResult.chunks.length, 1);
  assert.equal(userAResult.chunks[0].text, 'user-a chunk');

  const userBResult = await retriever.retrieveWithTiming('query', {
    userId: 'user-b',
    tier: 'consultant',
    scopes: ['user'],
    globalKbEnabled: false,
  });

  assert.equal(userBResult.chunks[0].text, 'user-b chunk');
  assert.ok(globalResult.embedMs >= 0);
  assert.ok(globalResult.searchMs >= 0);
});
