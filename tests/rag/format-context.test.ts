import test from 'node:test';
import assert from 'node:assert/strict';
import { RetrievalResult } from '../../src/modules/knowledge/knowledge.types';

test('formatRetrievalContext matches legacy KnowledgeGateway shape', async () => {
  const { formatRetrievalContext } = await import('../../src/modules/rag/format-context');
  const knowledgeGateway = require('../../src/modules/knowledge/knowledge.gateway');

  const result = new RetrievalResult({
    query: 'test',
    mode: 'balanced',
    chunks: [{
      id: 'c1',
      sourceId: 's1',
      text: 'The secret code is 12345',
      score: 0.95,
      provenance: { title: 'Secret Doc', uri: 'http://example.com/doc1' },
    }],
  });

  const formatted = formatRetrievalContext(result);
  const gatewayFormatted = knowledgeGateway.formatContext(result);

  assert.equal(formatted, gatewayFormatted);
  assert.ok(formatted.includes('RETRIEVED CONTEXT START'));
  assert.ok(formatted.includes('The secret code is 12345'));
  assert.ok(formatted.includes('95.0%'));
  assert.ok(formatted.includes('Secret Doc'));
});
