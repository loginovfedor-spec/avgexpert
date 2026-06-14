import '../helpers/knowledge-test-env';
import test from 'node:test';
import assert from 'node:assert';
import knowledgeGateway from '../../src/modules/knowledge/knowledge.gateway';
import knowledgeCache from '../../src/modules/knowledge/knowledge.cache';
import knowledgeRouter from '../../src/modules/knowledge/knowledge.router';

test('RAG Integration: KnowledgeGateway Pipeline', async (t) => {
  await t.test('should retrieve chunks and build augmented context', async () => {
    knowledgeCache.clear();

    knowledgeGateway.registerRetriever('rag_test', {
      search: async () => [
        {
          id: 'chunk-1',
          sourceId: 'source-doc-1',
          text: 'The secret code is 12345',
          score: 0.95,
          provenance: { title: 'Secret Doc', uri: 'http://example.com/doc1' },
        },
      ],
    });

    const result = await knowledgeGateway.retrieve('What is the secret code?', {
      settings: { retriever_id: 'rag_test', rag_answerability_policy: 'balanced' },
    });

    assert.ok(result, 'Should return a RetrievalResult');
    assert.strictEqual(result.chunks.length, 1, 'Should return 1 chunk');
    assert.strictEqual(result.chunks[0].text, 'The secret code is 12345');
    assert.ok(result.chunks[0].score >= 0.9, 'Score should be high');
    assert.strictEqual(result.metadata.shouldRefuse, false, 'Should not refuse — high quality chunk');
  });

  await t.test('should honor settings override', () => {
    const { mode } = knowledgeRouter.resolveMode(
      'Explain the process of nuclear fission and the chain reaction mechanism.',
      { rag_mode: 'max_quality' }
    );
    assert.strictEqual(mode, 'max_quality');
  });

  await t.test('should format retrieved chunks into augmented context string', async () => {
    const result = await knowledgeGateway.retrieve('What is the secret code?', {
      settings: { retriever_id: 'rag_test' },
    });

    const contextText = knowledgeGateway.formatContext(result);
    assert.ok(contextText.includes('The secret code is 12345'), 'Context should contain chunk text');
    assert.ok(contextText.includes('Secret Doc'), 'Context should contain source title');
    assert.ok(contextText.includes('95.0%'), 'Context should show relevance score');
    assert.ok(contextText.includes('RETRIEVED CONTEXT START'), 'Context should have boundary markers');
  });

  await t.test('should apply refusal policy when no chunks found', async () => {
    knowledgeCache.clear();

    knowledgeGateway.registerRetriever('empty_retriever', {
      search: async () => [],
    });

    const result = await knowledgeGateway.retrieve('What is the unanswerable query?', {
      settings: { retriever_id: 'empty_retriever', rag_answerability_policy: 'refusal' },
    });

    assert.strictEqual(result.chunks.length, 0, 'Should return no chunks');
    assert.strictEqual(result.metadata.shouldRefuse, true, 'Should trigger refusal policy');
  });

  await t.test('should cache retrieval results to avoid redundant DB hits', async () => {
    knowledgeCache.clear();

    let callCount = 0;
    knowledgeGateway.registerRetriever('counting_retriever', {
      search: async () => {
        callCount++;
        return [
          {
            id: 'c1',
            sourceId: 's1',
            text: 'cached content',
            score: 0.8,
            provenance: { title: 'Doc', uri: 'http://doc' },
          },
        ];
      },
    });

    await knowledgeGateway.retrieve('cache test query for rag', {
      settings: { retriever_id: 'counting_retriever' },
    });
    const result2 = await knowledgeGateway.retrieve('cache test query for rag', {
      settings: { retriever_id: 'counting_retriever' },
    });

    assert.strictEqual(callCount, 1, 'Retriever should only be called once (cache hit on second)');
    assert.strictEqual(result2.metadata.cacheHit, true, 'Second call should be a cache hit');
  });
});
