const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categoryRagAllowed,
  userRagEnabled,
  isRagEffective,
} = require('../../src/modules/rag/rag.policy');

test('categoryRagAllowed respects rag_allowed and legacy rag_enabled', () => {
  assert.equal(categoryRagAllowed({ rag_allowed: true }), true);
  assert.equal(categoryRagAllowed({ rag_allowed: 0 }), false);
  assert.equal(categoryRagAllowed({ rag_enabled: true }), true);
  assert.equal(categoryRagAllowed({}), false);
});

test('userRagEnabled defaults to true when unset', () => {
  assert.equal(userRagEnabled({}), true);
  assert.equal(userRagEnabled({ rag_enabled: false }), false);
  assert.equal(userRagEnabled({ rag_enabled: 0 }), false);
});

test('isRagEffective requires both category allowance and user preference', () => {
  assert.equal(isRagEffective({ rag_allowed: true }, { rag_enabled: true }), true);
  assert.equal(isRagEffective({ rag_allowed: true }, { rag_enabled: false }), false);
  assert.equal(isRagEffective({ rag_allowed: false }, { rag_enabled: true }), false);
  assert.equal(isRagEffective({ rag_allowed: false }, { rag_enabled: false }), false);
});
