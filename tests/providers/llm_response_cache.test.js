const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCacheKey } = require('../../src/modules/providers/llm_response_cache.repository');

test('generateCacheKey is deterministic and provider-scoped', () => {
  const payload = { model: 'gpt://folder/alice', input: [{ role: 'user' }] };
  const keyA = generateCacheKey('yandex', payload);
  const keyB = generateCacheKey('yandex', payload);
  const keyC = generateCacheKey('grok', payload);

  assert.strictEqual(keyA, keyB);
  assert.notStrictEqual(keyA, keyC);
  assert.match(keyA, /^[a-f0-9]{64}$/);
});
