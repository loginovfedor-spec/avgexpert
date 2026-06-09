import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('grok provider config has no collection_ids (S10-3)', () => {
  const providersConfig = require('../../src/core/providers.config');
  const grok = providersConfig.grok;
  assert.ok(grok);
  assert.equal(grok.extra_params?.collection_ids, undefined);
});

test('grok adapter has no native retrieval capability', () => {
  const adapter = require('../../src/modules/providers/adapters/grok');
  assert.equal(adapter.capabilities.retrieval, undefined);
});

test('stripNativeRag removes GROK_COLLECTION_IDS from merged settings', async () => {
  const { stripNativeRag } = await import('../../src/modules/rag/rag.orchestrator');
  const cleaned = stripNativeRag({
    GROK_COLLECTION_IDS: 'collection_old',
    collection_ids: ['col-1'],
    temperature: 0.3,
  });
  assert.equal(cleaned.GROK_COLLECTION_IDS, undefined);
  assert.equal(cleaned.collection_ids, undefined);
  assert.equal(cleaned.temperature, 0.3);
});

test('grok.env does not define active GROK_COLLECTION_IDS', () => {
  const envPath = path.join(__dirname, '../../src/modules/providers/config/grok.env');
  const content = fs.readFileSync(envPath, 'utf8');
  assert.doesNotMatch(content, /^GROK_COLLECTION_IDS=/m);
});
