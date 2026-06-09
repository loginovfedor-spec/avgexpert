
process.env.KNOWLEDGE_GATEWAY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert');
const knowledgeGateway = require('../../src/modules/knowledge/knowledge.gateway');
const knowledgeRouter = require('../../src/modules/knowledge/knowledge.router');
const { RetrievalChunk, RetrievalResult } = require('../../src/modules/knowledge/knowledge.types');

test('Knowledge Module: Types', async (t) => {
  await t.test('should validate a correct RetrievalChunk', () => {
    const chunk = new RetrievalChunk({
      id: 'c1',
      sourceId: 's1',
      text: 'hello world',
      score: 0.9
    });
    chunk.validate();
    assert.strictEqual(chunk.score, 0.9);
  });

  await t.test('should throw on invalid RetrievalChunk', () => {
    const chunk = new RetrievalChunk({ id: 'c1', sourceId: 's1' }); // missing text
    assert.throws(() => chunk.validate());
  });
});

test('Knowledge Module: Router', async (t) => {
  await t.test('should resolve "fast" mode for short queries', () => {
    // Note: 'hi' resolves to no_retrieval (trivial); a short but non-trivial query resolves to fast
    const { mode } = knowledgeRouter.resolveMode('weather tomorrow');
    assert.strictEqual(mode, 'fast');
  });

  await t.test('should resolve "balanced" mode for complex queries', () => {
    const { mode } = knowledgeRouter.resolveMode('Compare these two documents and analyze the differences between their approaches.');
    assert.strictEqual(mode, 'balanced');
  });

  await t.test('should honor settings override', () => {
    // Use a non-trivial query so Fast Path is not triggered before settings check
    const { mode } = knowledgeRouter.resolveMode('explain the architecture', { rag_mode: 'max_quality' });
    assert.strictEqual(mode, 'max_quality');
  });
});

test('Knowledge Module: Gateway', async (t) => {
  await t.test('should return no_retrieval if disabled or not configured', async () => {
    // Note: KNOWLEDGE_GATEWAY_ENABLED is handled via env/config, 
    // for unit tests we assume it's working but the default retriever returns empty.
    const result = await knowledgeGateway.retrieve('test query');
    assert.strictEqual(result.chunks.length, 0);
  });

  await t.test('should format context correctly', () => {
    const result = new RetrievalResult({
      query: 'q',
      chunks: [
        { id: 'c1', sourceId: 's1', text: 'chunk 1 text', score: 0.95, provenance: { title: 'Doc 1', uri: 'http://doc1' } }
      ]
    });
    const formatted = knowledgeGateway.formatContext(result);
    assert.ok(formatted.includes('chunk 1 text'));
    assert.ok(formatted.includes('95.0%'));
    assert.ok(formatted.includes('http://doc1'));
  });

  await t.test('should apply refusal policy', async () => {
    const result = await knowledgeGateway.retrieve('any query', { 
      settings: { rag_answerability_policy: 'refusal' } 
    });
    // With default mock retriever (empty), it should trigger refusal
    assert.strictEqual(result.metadata.shouldRefuse, true);
  });
});
