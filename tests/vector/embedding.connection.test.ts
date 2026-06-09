import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmbeddingSettings } from '../../src/modules/vector/embedding.connection';

test('resolveEmbeddingSettings: из vector/config/bge_m3.env', () => {
  const resolved = resolveEmbeddingSettings({});
  assert.equal(resolved.provider, 'self-hosted');
  assert.equal(resolved.model, 'bge-m3');
  assert.equal(resolved.dimensions, 1024);
  assert.equal(resolved.namespace, 'bge-m3-v1');
  assert.equal(resolved.apiUrl, 'http://83.166.253.250:8080/embed');
  assert.equal(resolved.apiFormat, 'tei');
});

test('resolveEmbeddingSettings: process.env имеет приоритет', () => {
  const resolved = resolveEmbeddingSettings({
    EMBEDDING_API_URL: 'http://127.0.0.1:9000/embed',
    EMBEDDING_NAMESPACE: 'custom-ns',
  });
  assert.equal(resolved.apiUrl, 'http://127.0.0.1:9000/embed');
  assert.equal(resolved.namespace, 'custom-ns');
});

test('resolveEmbeddingSettings: bge_m3.local для локальной среды', () => {
  const resolved = resolveEmbeddingSettings({
    VECTOR_EMBEDDING_CONFIG: 'bge_m3.local',
  });
  assert.equal(resolved.apiUrl, 'http://127.0.0.1:8090/embed');
  assert.equal(resolved.apiFormat, 'tei');
});
