
process.env.KNOWLEDGE_GATEWAY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert');
const knowledgeGateway = require('../../src/modules/knowledge/knowledge.gateway');
const knowledgeCache = require('../../src/modules/knowledge/knowledge.cache');

test('Knowledge Module: Performance & Cache', async (t) => {
  
  await t.test('should provide detailed latency breakdown', async () => {
    const query = "Analyze the reactor cooling system.";
    const result = await knowledgeGateway.retrieve(query);
    
    assert.ok(result.metadata.routerMs >= 0, 'Should have routerMs');
    assert.ok(result.metadata.retrieverMs >= 0, 'Should have retrieverMs');
    assert.ok(result.metadata.validationMs >= 0, 'Should have validationMs');
    assert.ok(result.metadata.latencyMs >= 0, 'Should have latencyMs');
  });

  await t.test('should use cache for repeated queries', async () => {
    knowledgeCache.clear();
    const query = "What is the secret code?";
    
    // First call (miss)
    const result1 = await knowledgeGateway.retrieve(query);
    assert.strictEqual(result1.metadata.cacheHit, false, 'First call should not be a cache hit');

    // Second call (hit)
    const result2 = await knowledgeGateway.retrieve(query);
    assert.strictEqual(result2.metadata.cacheHit, true, 'Second call should be a cache hit');
    assert.strictEqual(result2.query, result1.query);
  });

  await t.test('should honor Fast Path for trivial queries', async () => {
    const trivialQueries = ['hi', 'ok', 'thanks', 'bye'];
    
    for (const q of trivialQueries) {
      const result = await knowledgeGateway.retrieve(q);
      assert.strictEqual(result.mode, 'no_retrieval', `Query "${q}" should trigger Fast Path (no_retrieval)`);
    }
  });

  await t.test('should normalize queries for cache hits', async () => {
    knowledgeCache.clear();
    const q1 = "  What is   RAG?  ";
    const q2 = "what is rag?";
    
    await knowledgeGateway.retrieve(q1);
    const result2 = await knowledgeGateway.retrieve(q2);
    
    assert.strictEqual(result2.metadata.cacheHit, true, 'Normalized queries should hit the cache');
  });
});
