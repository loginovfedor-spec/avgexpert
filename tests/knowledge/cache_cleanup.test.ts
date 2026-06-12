import test from 'node:test';
import assert from 'node:assert';
import knowledgeCache from '../../src/modules/knowledge/knowledge.cache';
import type { RetrievalResult } from '../../src/modules/knowledge/knowledge.types';

type MutableKnowledgeCache = {
  ttl: number;
  cleanupIntervalMs: number;
  cache: Map<string, { result: RetrievalResult; expiresAt: number }>;
  clear(): void;
  set(key: string, result: RetrievalResult): void;
};

test('KnowledgeCache: removes expired entries during throttled cleanup on set', () => {
  const cache = knowledgeCache as unknown as MutableKnowledgeCache;
  const originalNow = Date.now;
  const originalTtl = cache.ttl;
  const originalCleanupIntervalMs = cache.cleanupIntervalMs;
  let now = 1000;
  Date.now = () => now;

  try {
    cache.clear();
    cache.ttl = 10;
    cache.cleanupIntervalMs = 5;

    cache.set('expired one', { query: 'expired one', chunks: [], metadata: {} } as unknown as RetrievalResult);
    cache.set('expired two', { query: 'expired two', chunks: [], metadata: {} } as unknown as RetrievalResult);
    assert.strictEqual(cache.cache.size, 2);

    now = 1011;
    cache.set('fresh', { query: 'fresh', chunks: [], metadata: {} } as unknown as RetrievalResult);

    assert.strictEqual(cache.cache.has('expired one'), false);
    assert.strictEqual(cache.cache.has('expired two'), false);
    assert.strictEqual(cache.cache.has('fresh'), true);
  } finally {
    Date.now = originalNow;
    cache.ttl = originalTtl;
    cache.cleanupIntervalMs = originalCleanupIntervalMs;
    cache.clear();
  }
});
