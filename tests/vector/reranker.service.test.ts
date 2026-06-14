import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRerankerConfig, createRerankerProvider } from '../../src/modules/vector/reranker.service';

test('loadRerankerConfig: defaults from gte_multilingual_reranker_base.docker.env', () => {
  const config = loadRerankerConfig({
    VECTOR_RERANKER_CONFIG: 'gte_multilingual_reranker_base.docker',
  });

  assert.equal(config.model, 'gte-multilingual-reranker-base');
  assert.equal(config.enabled, true);
  assert.equal(config.mock, false);
  assert.ok(config.apiUrl?.includes('/rerank'));
});

test('createRerankerProvider: returns null when disabled', () => {
  const provider = createRerankerProvider({
    model: 'bge-reranker-v2-m3',
    enabled: false,
    mock: false,
  });

  assert.equal(provider, null);
});

test('createRerankerProvider: mock mode without api url', () => {
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
