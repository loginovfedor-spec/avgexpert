import test from 'node:test';
import assert from 'node:assert/strict';
import * as limits from '../src/modules/chat/limit.service';

type LimitValidationError = Error & { code?: string; status?: number };

test('one user credit equals one kilotoken', () => {
  assert.equal(limits.creditsToTokens(1), 1000);
  assert.equal(limits.creditsToTokens(128), 128000);
});

test('limit service converts user output credits to tokens and clamps by category max_tokens', () => {
  const value = limits.getOutputLimit({ output_generation_credits: 128 }, { max_tokens: 64000 }, {});
  assert.equal(value, 64000);
});

test('limit service converts input credits to tokens and clamps by adapter caps', () => {
  const value = limits.getInputLimit(
    { input_context_credits: 900 },
    { input_context_default: 500000, input_context_max: 800000 },
    { _env: { MAX_INPUT_CONTEXT_TOKENS: '700000' } }
  );
  assert.equal(value, 700000);
});

test('output credits are capped by adapter token env limit', () => {
  const value = limits.getOutputLimit(
    { output_generation_credits: 128 },
    { max_tokens: 128000 },
    { _env: { MAX_OUTPUT_TOKENS: '32000' } }
  );
  assert.equal(value, 32000);
});

test('input validation rejects oversized context instead of trimming it', () => {
  assert.throws(
    () =>
      limits.validateInputLimit(
        [{ role: 'user', content: 'x'.repeat(80) }],
        { input_context_credits: 0 },
        { input_context_default: 5, input_context_max: 1000 },
        {}
      ),
    (err: unknown) => {
      const e = err as LimitValidationError;
      return e.code === 'input_context_limit_exceeded' && e.status === 400;
    }
  );
});

test('user limit validation enforces configured slider ranges', () => {
  const result = limits.validateUserLimits({
    userValues: { input_context_credits: 1001, output_generation_credits: 129 },
    categorySettings: { input_context_max: 2000, max_tokens: 1000 },
    providerCfg: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});
