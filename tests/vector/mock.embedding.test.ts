import test from 'node:test';
import assert from 'node:assert/strict';
import { MockEmbeddingProvider } from '../../src/modules/vector/providers/mock.embedding';

test('MockEmbeddingProvider: стабильные векторы и размерность', async () => {
  const provider = new MockEmbeddingProvider({ dimensions: 8, model: 'mock-bge' });
  const [a1, a2] = await provider.embed(['тест', 'тест']);
  const [b] = await provider.embed(['другой текст']);

  assert.equal(a1.length, 8);
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1, b);
});

test('MockEmbeddingProvider: embedQuery отличается от embed', async () => {
  const provider = new MockEmbeddingProvider({ dimensions: 16 });
  const [doc] = await provider.embed(['документ']);
  const query = await provider.embedQuery('документ');
  assert.notDeepEqual(doc, query);
});
