const test = require('node:test');
const assert = require('node:assert');

function loadConfig(overrides = {}) {
  const saved = {};
  for (const key of [
    'NODE_ENV',
    'AVGEXPERT_SECRET',
    'RAG_V2_ENABLED',
    'AVGEXPERT_DEPLOY_ENV',
    'KNOWLEDGE_GATEWAY_ENABLED',
  ]) {
    saved[key] = process.env[key];
  }

  process.env.NODE_ENV = 'test';
  if (!process.env.AVGEXPERT_SECRET) {
    process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  delete require.cache[require.resolve('../src/core/config')];
  const config = require('../src/core/config');

  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return config;
}

test('RAG_V2_ENABLED defaults to false in development deploy env', () => {
  const config = loadConfig({
    RAG_V2_ENABLED: undefined,
    AVGEXPERT_DEPLOY_ENV: 'development',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, false);
  assert.strictEqual(config.FEATURE_FLAGS.RAG_V2_ENABLED, false);
});

test('RAG_V2_ENABLED defaults to true when AVGEXPERT_DEPLOY_ENV=staging', () => {
  const config = loadConfig({
    RAG_V2_ENABLED: undefined,
    AVGEXPERT_DEPLOY_ENV: 'staging',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, true);
  assert.strictEqual(config.isStaging, true);
});

test('RAG_V2_ENABLED defaults to true when AVGEXPERT_DEPLOY_ENV=production', () => {
  const config = loadConfig({
    RAG_V2_ENABLED: undefined,
    AVGEXPERT_DEPLOY_ENV: 'production',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, true);
  assert.strictEqual(config.isProductionDeploy, true);
});

test('FTS_FALLBACK_ENABLED defaults to true', () => {
  const config = loadConfig({ FTS_FALLBACK_ENABLED: undefined });
  assert.strictEqual(config.FTS_FALLBACK_ENABLED, true);
});

test('FTS_FALLBACK_ENABLED reads false from env', () => {
  const config = loadConfig({ FTS_FALLBACK_ENABLED: 'false' });
  assert.strictEqual(config.FTS_FALLBACK_ENABLED, false);
});

test('RAG_V2_ENABLED explicit env overrides staging default', () => {
  const config = loadConfig({
    RAG_V2_ENABLED: 'false',
    AVGEXPERT_DEPLOY_ENV: 'staging',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, false);
});

test('RAG_V2_ENABLED reads true from env', () => {
  const config = loadConfig({ RAG_V2_ENABLED: 'true' });
  assert.strictEqual(config.RAG_V2_ENABLED, true);
});
