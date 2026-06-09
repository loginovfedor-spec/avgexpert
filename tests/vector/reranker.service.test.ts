import test from 'node:test';
import assert from 'node:assert/strict';

test('loadRerankerConfig: defaults from bge_reranker_v2_m3.env', () => {
  const { loadRerankerConfig } = require('../../src/modules/vector/reranker.service');
  const config = loadRerankerConfig({
    VECTOR_RERANKER_CONFIG: 'bge_reranker_v2_m3',
  });

  assert.equal(config.model, 'bge-reranker-v2-m3');
  assert.equal(config.enabled, false);
  assert.equal(config.mock, false);
  assert.ok(config.apiUrl?.includes('/rerank'));
});

test('createRerankerProvider: returns null when disabled', () => {
  const { createRerankerProvider } = require('../../src/modules/vector/reranker.service');
  const provider = createRerankerProvider({
    model: 'bge-reranker-v2-m3',
    enabled: false,
    mock: false,
  });

  assert.equal(provider, null);
});

test('createRerankerProvider: mock mode without api url', () => {
  const { createRerankerProvider } = require('../../src/modules/vector/reranker.service');
  const provider = createRerankerProvider({
    model: 'bge-reranker-v2-m3',
    enabled: true,
    mock: true,
  });

  assert.equal(provider?.id, 'mock-reranker');
});

test('shouldRerankTier: expert and sage only', async () => {
  const { shouldRerankTier } = await import('../../src/modules/vector/reranker.service');
  assert.equal(shouldRerankTier('consultant'), false);
  assert.equal(shouldRerankTier('expert'), true);
  assert.equal(shouldRerankTier('sage'), true);
});
