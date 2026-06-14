import '../helpers/knowledge-test-env';
import test from 'node:test';
import assert from 'node:assert';
import knowledgeGateway from '../../src/modules/knowledge/knowledge.gateway';
import knowledgeRouter from '../../src/modules/knowledge/knowledge.router';
import { RetrievalChunk, RetrievalResult } from '../../src/modules/knowledge/knowledge.types';

test('Knowledge Module: Types', async (t) => {
  await t.test('should validate a correct RetrievalChunk', () => {
    const chunk = new RetrievalChunk({
      id: 'c1',
      sourceId: 's1',
      text: 'hello world',
      score: 0.9,
    });
    chunk.validate();
    assert.strictEqual(chunk.score, 0.9);
  });

  await t.test('should throw on invalid RetrievalChunk', () => {
    const chunk = new RetrievalChunk({ id: 'c1', sourceId: 's1' });
    assert.throws(() => chunk.validate());
  });
});

test('Knowledge Module: Router', async (t) => {
  await t.test('should resolve "fast" mode for short queries', () => {
    const { mode } = knowledgeRouter.resolveMode('weather tomorrow');
    assert.strictEqual(mode, 'fast');
  });

  await t.test('should resolve "balanced" mode for complex queries', () => {
    const { mode } = knowledgeRouter.resolveMode(
      'Compare these two documents and analyze the differences between their approaches.'
    );
    assert.strictEqual(mode, 'balanced');
  });

  await t.test('should honor settings override', () => {
    const { mode } = knowledgeRouter.resolveMode('explain the architecture', { rag_mode: 'max_quality' });
    assert.strictEqual(mode, 'max_quality');
  });
});

test('Knowledge Module: Gateway', async (t) => {
  await t.test('should return no_retrieval if disabled or not configured', async () => {
    const result = await knowledgeGateway.retrieve('test query');
    assert.strictEqual(result.chunks.length, 0);
  });

  await t.test('should format context correctly', () => {
    const result = new RetrievalResult({
      query: 'q',
      chunks: [
        {
          id: 'c1',
          sourceId: 's1',
          text: 'chunk 1 text',
          score: 0.95,
          provenance: { title: 'Doc 1', uri: 'http://doc1' },
        },
      ],
    });
    const formatted = knowledgeGateway.formatContext(result);
    assert.ok(formatted.includes('chunk 1 text'));
    assert.ok(formatted.includes('95.0%'));
    assert.ok(formatted.includes('http://doc1'));
  });

  await t.test('should apply refusal policy', async () => {
    const result = await knowledgeGateway.retrieve('any query', {
      settings: { rag_answerability_policy: 'refusal' },
    });
    assert.strictEqual(result.metadata.shouldRefuse, true);
  });
});
