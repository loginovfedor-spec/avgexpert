import test from 'node:test';
import assert from 'node:assert/strict';
import { RetrievalResult } from '../../src/modules/knowledge/knowledge.types';

test('ScopedRetrievalCache isolates user A and user B on same query', async () => {
  const {
    ScopedRetrievalCache,
    buildScopedCacheKey,
  } = await import('../../src/modules/rag/scoped.cache');

  const cache = new ScopedRetrievalCache();

  const base = {
    query: 'Как заменить свечи?',
    namespace: 'bge-m3-v1',
    tier: 'consultant' as const,
    scopes: ['global' as const],
  };

  const keyA = buildScopedCacheKey({ ...base, userId: 'user-a' });
  const keyB = buildScopedCacheKey({ ...base, userId: 'user-b' });

  assert.notEqual(keyA, keyB);

  const resultA = new RetrievalResult({
    query: base.query,
    chunks: [{ id: 'a1', sourceId: 's1', text: 'answer A', score: 0.9, provenance: { title: 'A' } }],
  });
  const resultB = new RetrievalResult({
    query: base.query,
    chunks: [{ id: 'b1', sourceId: 's2', text: 'answer B', score: 0.8, provenance: { title: 'B' } }],
  });

  cache.set(keyA, resultA);
  cache.set(keyB, resultB);

  assert.equal(cache.get(keyA)?.chunks[0].text, 'answer A');
  assert.equal(cache.get(keyB)?.chunks[0].text, 'answer B');
});
