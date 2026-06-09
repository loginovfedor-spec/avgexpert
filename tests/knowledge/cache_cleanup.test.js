const test = require('node:test');
const assert = require('node:assert');
const knowledgeCache = require('../../src/modules/knowledge/knowledge.cache');

test('KnowledgeCache: removes expired entries during throttled cleanup on set', () => {
  const originalNow = Date.now;
  const originalTtl = knowledgeCache.ttl;
  const originalCleanupIntervalMs = knowledgeCache.cleanupIntervalMs;
  let now = 1000;
  Date.now = () => now;

  try {
    knowledgeCache.clear();
    knowledgeCache.ttl = 10;
    knowledgeCache.cleanupIntervalMs = 5;

    knowledgeCache.set('expired one', { query: 'expired one', chunks: [], metadata: {} });
    knowledgeCache.set('expired two', { query: 'expired two', chunks: [], metadata: {} });
    assert.strictEqual(knowledgeCache.cache.size, 2);

    now = 1011;
    knowledgeCache.set('fresh', { query: 'fresh', chunks: [], metadata: {} });

    assert.strictEqual(knowledgeCache.cache.has('expired one'), false);
    assert.strictEqual(knowledgeCache.cache.has('expired two'), false);
    assert.strictEqual(knowledgeCache.cache.has('fresh'), true);
  } finally {
    Date.now = originalNow;
    knowledgeCache.ttl = originalTtl;
    knowledgeCache.cleanupIntervalMs = originalCleanupIntervalMs;
    knowledgeCache.clear();
  }
});
