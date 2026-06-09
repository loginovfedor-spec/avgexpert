import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmbeddingProvider,
  loadEmbeddingConfig,
} from '../../src/modules/vector/embedding.service';
import { MockEmbeddingProvider } from '../../src/modules/vector/providers/mock.embedding';
import { SelfHostedEmbeddingProvider } from '../../src/modules/vector/providers/selfhosted.embedding';

test('loadEmbeddingConfig: defaults из vector/config/bge_m3.env', () => {
  const config = loadEmbeddingConfig({
    EMBEDDING_MOCK: 'false',
  });
  assert.equal(config.provider, 'self-hosted');
  assert.equal(config.model, 'bge-m3');
  assert.equal(config.dimensions, 1024);
  assert.equal(config.namespace, 'bge-m3-v1');
  assert.equal(config.apiUrl, 'http://83.166.253.250:8080/embed');
  assert.equal(config.apiFormat, 'tei');
});

test('createEmbeddingProvider: mock mode', () => {
  const provider = createEmbeddingProvider({
    provider: 'mock',
    model: 'bge-m3',
    dimensions: 32,
    namespace: 'test-ns',
    mock: true,
  });
  assert.ok(provider instanceof MockEmbeddingProvider);
});

test('createEmbeddingProvider: self-hosted requires api url', () => {
  assert.throws(() => createEmbeddingProvider({
    provider: 'self-hosted',
    model: 'bge-m3',
    dimensions: 1024,
    namespace: 'bge-m3-v1',
    mock: false,
  }), /EMBEDDING_API_URL/);
});

test('createEmbeddingProvider: self-hosted with api url', () => {
  const provider = createEmbeddingProvider({
    provider: 'self-hosted',
    model: 'bge-m3',
    dimensions: 1024,
    namespace: 'bge-m3-v1',
    apiUrl: 'http://127.0.0.1:8099/embed',
    apiFormat: 'custom',
    mock: false,
  });
  assert.ok(provider instanceof SelfHostedEmbeddingProvider);
});
