import test from 'node:test';
import assert from 'node:assert/strict';

test('all tiers share full KB scopes — no tier-based restrictions', async () => {
  const { resolveScopes } = await import('../../src/modules/rag/tier.policy');

  for (const tier of ['consultant', 'expert', 'sage'] as const) {
    assert.deepEqual(resolveScopes(tier), ['global', 'user', 'session']);
  }
});

test('scopes can be opted out explicitly via extra_params', async () => {
  const { resolveScopes } = await import('../../src/modules/rag/tier.policy');

  const scopes = resolveScopes('consultant', {
    user_kb_enabled: false,
    session_kb_enabled: false,
  });

  assert.deepEqual(scopes, ['global']);
});

test('getTopK differs by tier depth only', async () => {
  const { getTopK } = await import('../../src/modules/rag/tier.policy');

  assert.equal(getTopK('consultant'), 3);
  assert.equal(getTopK('expert'), 7);
  assert.equal(getTopK('sage'), 12);
});
