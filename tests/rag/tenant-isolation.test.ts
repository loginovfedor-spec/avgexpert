import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RetrievalResult } from '../../src/modules/knowledge/knowledge.types';
import { asMock } from '../helpers/cast';
import type { VectorStore } from '../../src/modules/vector/ports/vector.store';

const DIMS = 64;

test('Tenant isolation: TieredRetriever owner_user_id filter', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const namespace = `iso-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });

  const store = {
    id: 'mock-store',
    async search(params: {
      filter?: { scope?: string; ownerUserId?: string; sessionId?: string };
    }) {
      const scope = params.filter?.scope;
      if (scope === 'user' && params.filter?.ownerUserId === 'user-a') {
        return [{
          id: 'ua1', namespace, scope: 'user', body: 'secret A', score: 0.99,
          metadata: { title: 'A' },
        }];
      }
      if (scope === 'user' && params.filter?.ownerUserId === 'user-b') {
        return [{
          id: 'ub1', namespace, scope: 'user', body: 'secret B', score: 0.88,
          metadata: { title: 'B' },
        }];
      }
      if (scope === 'session' && params.filter?.ownerUserId === 'user-a' && params.filter?.sessionId === 'sess-a') {
        return [{
          id: 'sa1', namespace, scope: 'session', body: 'session A', score: 0.77,
          metadata: { title: 'SA' },
        }];
      }
      if (scope === 'session' && params.filter?.ownerUserId === 'user-b' && params.filter?.sessionId === 'sess-b') {
        return [{
          id: 'sb1', namespace, scope: 'session', body: 'session B', score: 0.66,
          metadata: { title: 'SB' },
        }];
      }
      return [];
    },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), namespace);

  const userA = await retriever.retrieve('q', {
    userId: 'user-a',
    sessionId: 'sess-a',
    tier: 'consultant',
    scopes: ['user', 'session'],
    globalKbEnabled: false,
  });
  assert.equal(userA[0]?.text, 'secret A');

  const userB = await retriever.retrieve('q', {
    userId: 'user-b',
    sessionId: 'sess-b',
    tier: 'consultant',
    scopes: ['user', 'session'],
    globalKbEnabled: false,
  });
  assert.equal(userB[0]?.text, 'secret B');
  assert.notEqual(userA[0]?.text, userB[0]?.text);

  const crossSession = await retriever.retrieve('q', {
    userId: 'user-a',
    sessionId: 'sess-b',
    tier: 'consultant',
    scopes: ['session'],
    globalKbEnabled: false,
  });
  assert.equal(crossSession.length, 0);
});

test('Tenant isolation: scoped cache keys differ per user and session', async () => {
  const {
    ScopedRetrievalCache,
    buildScopedCacheKey,
  } = await import('../../src/modules/rag/scoped.cache');

  const cache = new ScopedRetrievalCache();
  const base = {
    query: 'test query',
    namespace: 'bge-m3-v1',
    tier: 'consultant' as const,
    scopes: ['user' as const, 'session' as const],
  };

  const keyA = buildScopedCacheKey({ ...base, userId: 'user-a', sessionId: 's1' });
  const keyB = buildScopedCacheKey({ ...base, userId: 'user-b', sessionId: 's1' });
  const keyOtherSession = buildScopedCacheKey({ ...base, userId: 'user-a', sessionId: 's2' });

  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyOtherSession);

  cache.set(keyA, new RetrievalResult({
    query: base.query,
    chunks: [{ id: '1', sourceId: '1', text: 'only A', score: 1, provenance: { title: 'A' } }],
  }));

  assert.equal(cache.get(keyB), null);
  assert.equal(cache.get(keyOtherSession), null);
  assert.equal(cache.get(keyA)?.chunks[0].text, 'only A');
});
