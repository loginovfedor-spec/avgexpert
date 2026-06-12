import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCacheKey } from '../helpers/llm_cache';

test('generateCacheKey is deterministic and provider-scoped', () => {
  const payload = { model: 'gpt://folder/alice', input: [{ role: 'user' }] };
  const keyA = generateCacheKey('yandex', payload);
  const keyB = generateCacheKey('yandex', payload);
  const keyC = generateCacheKey('grok', payload);

  assert.strictEqual(keyA, keyB);
  assert.notStrictEqual(keyA, keyC);
  assert.match(keyA, /^[a-f0-9]{64}$/);
});
