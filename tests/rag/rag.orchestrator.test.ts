import test from 'node:test';
import assert from 'node:assert/strict';

test('RagOrchestrator.resolve strips native RAG params when RAG_V2 enabled', async () => {
  const prev = process.env.RAG_V2_ENABLED;
  process.env.RAG_V2_ENABLED = 'true';

  const { RagOrchestrator } = await import('../../src/modules/rag/rag.orchestrator');
  const orchestrator = new RagOrchestrator({
    retriever: {
      retrieveWithTiming: async () => ({ chunks: [], embedMs: 1, searchMs: 2 }),
      retrieve: async () => [],
    },
    namespace: 'test-ns',
    cache: { get: () => null, set: () => {}, clear: () => {} },
  });

  const resolved = orchestrator.resolve({
    catSettings: { rag_allowed: true },
    mergedSettings: {
      model_name: 'gpt-4.1-mini',
      extra_params: {
        collection_ids: ['col-1'],
        vector_store_ids: ['vs-1'],
        enable_search: true,
        tools: [{ type: 'file_search' }, { type: 'function', name: 'calc' }],
        temperature: 0.2,
      },
    },
  });

  const extra = resolved.extra_params as Record<string, unknown>;
  assert.equal(extra.collection_ids, undefined);
  assert.equal(extra.vector_store_ids, undefined);
  assert.equal(extra.enable_search, undefined);
  assert.deepEqual(extra.tools, [{ type: 'function', name: 'calc' }]);
  assert.equal(extra.temperature, 0.2);

  if (prev !== undefined) process.env.RAG_V2_ENABLED = prev;
  else delete process.env.RAG_V2_ENABLED;
});

test('RagOrchestrator.retrieve uses scoped cache', async () => {
  const prev = process.env.RAG_V2_ENABLED;
  process.env.RAG_V2_ENABLED = 'true';

  const { ScopedRetrievalCache } = await import('../../src/modules/rag/scoped.cache');
  const { RagOrchestrator } = await import('../../src/modules/rag/rag.orchestrator');

  let retrieveCalls = 0;
  const cache = new ScopedRetrievalCache();
  const orchestrator = new RagOrchestrator({
    retriever: {
      retrieveWithTiming: async () => {
        retrieveCalls++;
        return {
          chunks: [{
            id: 'c1',
            sourceId: 'd1',
            text: 'cached path',
            score: 0.9,
            provenance: { title: 'Doc' },
          }],
          embedMs: 5,
          searchMs: 10,
        };
      },
      retrieve: async () => [],
    },
    namespace: 'test-ns',
    cache,
  });

  const input = {
    query: 'test query',
    catSettings: {
      rag_allowed: true,
      retrieval_tier: 'consultant',
    },
    user: { username: 'cache-user' },
  };

  const first = await orchestrator.retrieve(input);
  const second = await orchestrator.retrieve(input);

  assert.equal(retrieveCalls, 1);
  assert.equal(first.metadata.cacheHit, false);
  assert.equal(second.metadata.cacheHit, true);
  assert.equal(second.metadata.embedMs, 5);
  assert.equal(second.metadata.searchMs, 10);

  if (prev !== undefined) process.env.RAG_V2_ENABLED = prev;
  else delete process.env.RAG_V2_ENABLED;
});
