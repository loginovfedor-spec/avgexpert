import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import providersConfig from '../../src/core/providers.config';
import grokAdapter from '../../src/modules/providers/adapters/grok';

test('grok provider config has no collection_ids (S10-3)', () => {
  const grok = providersConfig.grok;
  assert.ok(grok);
  assert.equal(grok.extra_params?.collection_ids, undefined);
});

test('grok adapter has no native retrieval capability', () => {
  assert.equal(grokAdapter.capabilities.retrieval, undefined);
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

test('stripNativeRag removes gateway-only KB flags from provider payload', async () => {
  const { stripNativeRag } = await import('../../src/modules/rag/rag.orchestrator');
  const cleaned = stripNativeRag({
    global_kb_enabled: true,
    user_kb_enabled: false,
    session_kb_enabled: true,
    temperature: 0.5,
  });
  assert.equal(cleaned.global_kb_enabled, undefined);
  assert.equal(cleaned.user_kb_enabled, undefined);
  assert.equal(cleaned.session_kb_enabled, undefined);
  assert.equal(cleaned.temperature, 0.5);
});

test('grok.env does not define active GROK_COLLECTION_IDS', () => {
  const envPath = path.join(__dirname, '../../src/modules/providers/config/grok.env');
  const content = fs.readFileSync(envPath, 'utf8');
  assert.doesNotMatch(content, /^GROK_COLLECTION_IDS=/m);
});
