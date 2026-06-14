import dotenv from 'dotenv';
import test from 'node:test';
import assert from 'node:assert';

const CONFIG_KEYS = [
  'NODE_ENV',
  'AVGEXPERT_SECRET',
  'RAG_V2_ENABLED',
  'AVGEXPERT_DEPLOY_ENV',
  'KNOWLEDGE_GATEWAY_ENABLED',
  'FTS_FALLBACK_ENABLED',
] as const;

async function loadConfig(overrides: Record<string, string | undefined> = {}) {
  const saved: Record<string, string | undefined> = {};
  for (const key of CONFIG_KEYS) {
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

  const originalDotenvConfig = dotenv.config;
  dotenv.config = () => ({ parsed: {} });

  try {
    const mod = await import(`../src/core/config.js?reload=${Date.now()}`);
    return mod;
  } finally {
    dotenv.config = originalDotenvConfig;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('RAG_V2_ENABLED defaults to false in development deploy env', async () => {
  const config = await loadConfig({
    RAG_V2_ENABLED: undefined,
    AVGEXPERT_DEPLOY_ENV: 'development',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, false);
  assert.strictEqual(config.FEATURE_FLAGS.RAG_V2_ENABLED, false);
});

test('RAG_V2_ENABLED defaults to true when AVGEXPERT_DEPLOY_ENV=staging', async () => {
  const config = await loadConfig({
    RAG_V2_ENABLED: undefined,
    AVGEXPERT_DEPLOY_ENV: 'staging',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, true);
  assert.strictEqual(config.isStaging, true);
});

test('RAG_V2_ENABLED defaults to true when AVGEXPERT_DEPLOY_ENV=production', async () => {
  const config = await loadConfig({
    RAG_V2_ENABLED: undefined,
    AVGEXPERT_DEPLOY_ENV: 'production',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, true);
  assert.strictEqual(config.isProductionDeploy, true);
});

test('FTS_FALLBACK_ENABLED defaults to true', async () => {
  const config = await loadConfig({ FTS_FALLBACK_ENABLED: undefined });
  assert.strictEqual(config.FTS_FALLBACK_ENABLED, true);
});

test('FTS_FALLBACK_ENABLED reads false from env', async () => {
  const config = await loadConfig({ FTS_FALLBACK_ENABLED: 'false' });
  assert.strictEqual(config.FTS_FALLBACK_ENABLED, false);
});

test('RAG_V2_ENABLED explicit env overrides staging default', async () => {
  const config = await loadConfig({
    RAG_V2_ENABLED: 'false',
    AVGEXPERT_DEPLOY_ENV: 'staging',
  });
  assert.strictEqual(config.RAG_V2_ENABLED, false);
});

test('RAG_V2_ENABLED reads true from env', async () => {
  const config = await loadConfig({ RAG_V2_ENABLED: 'true' });
  assert.strictEqual(config.RAG_V2_ENABLED, true);
});
