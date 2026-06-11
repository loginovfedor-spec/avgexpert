const test = require('node:test');
const assert = require('node:assert/strict');
const limits = require('../../src/modules/chat/limit.service');

test('getProviderTimeout uses llamacpp env override', () => {
  const ms = limits.getProviderTimeout({
    adapter: 'llamacpp',
    _env: { PROVIDER_TIMEOUT_MS: '420000' },
  }, 60000);
  assert.strictEqual(ms, 420000);
});

test('getProviderTimeout defaults local providers to at least 5 minutes', () => {
  const ms = limits.getProviderTimeout({ adapter: 'llamacpp' }, 60000);
  assert.strictEqual(ms, limits.LOCAL_PROVIDER_DEFAULT_TIMEOUT_MS);
});

test('getProviderTimeout keeps cloud default for openai', () => {
  const ms = limits.getProviderTimeout({ adapter: 'openai' }, 60000);
  assert.strictEqual(ms, 60000);
});
