import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderUtils } from '../../src/modules/providers/adapters/provider_utils';

test('ProviderUtils.normalizeUsage: maps cachedContentTokenCount to cached_input_tokens', () => {
  const usage = ProviderUtils.normalizeUsage({
    prompt_tokens: 1000,
    completion_tokens: 200,
    total_tokens: 1200,
    cachedContentTokenCount: 800,
  });

  assert.strictEqual(usage.prompt_tokens, 1000);
  assert.strictEqual(usage.completion_tokens, 200);
  assert.strictEqual(usage.cached_input_tokens, 800);
});

test('ProviderUtils.normalizeUsage: maps Google-style metadata via adapter helper shape', () => {
  const usage = ProviderUtils.normalizeUsage({
    prompt_tokens: 500,
    completion_tokens: 100,
    total_tokens: 600,
    cachedContentTokenCount: 300,
  });

  assert.strictEqual(usage.cached_input_tokens, 300);
});
