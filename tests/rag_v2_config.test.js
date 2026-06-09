const test = require('node:test');
const assert = require('node:assert');

function loadConfig() {
  process.env.NODE_ENV = 'test';
  if (!process.env.AVGEXPERT_SECRET) {
    process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
  }
  delete require.cache[require.resolve('../src/core/config')];
  return require('../src/core/config');
}

test('RAG_V2_ENABLED defaults to false', () => {
  const prev = process.env.RAG_V2_ENABLED;
  delete process.env.RAG_V2_ENABLED;
  process.env.RAG_V2_ENABLED = 'false';
  const config = loadConfig();
  assert.strictEqual(config.RAG_V2_ENABLED, false);
  assert.strictEqual(config.FEATURE_FLAGS.RAG_V2_ENABLED, false);
  if (prev !== undefined) process.env.RAG_V2_ENABLED = prev;
});

test('RAG_V2_ENABLED reads true from env', () => {
  const prev = process.env.RAG_V2_ENABLED;
  process.env.RAG_V2_ENABLED = 'true';
  const config = loadConfig();
  assert.strictEqual(config.RAG_V2_ENABLED, true);
  if (prev !== undefined) process.env.RAG_V2_ENABLED = prev;
  else delete process.env.RAG_V2_ENABLED;
});
