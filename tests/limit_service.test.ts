import test from 'node:test';
import assert from 'node:assert/strict';
import * as limits from '../src/modules/chat/limit.service';

type LimitValidationError = Error & { code?: string; status?: number };

test('user token limits are used directly', () => {
  assert.equal(limits.getInputLimit({ input_context_limit: 4096 }, { input_context_max: 64000 }, {}), 4096);
  assert.equal(limits.getOutputLimit({ output_generation_limit: 8192 }, { max_tokens: 64000 }, {}), 8192);
});

test('limit service clamps user output tokens by category max_tokens', () => {
  const value = limits.getOutputLimit({ output_generation_limit: 131072 }, { max_tokens: 64000 }, {});
  assert.equal(value, 64000);
});

test('limit service clamps input tokens by adapter caps', () => {
  const value = limits.getInputLimit(
    { input_context_limit: 900000 },
    { input_context_default: 500000, input_context_max: 800000 },
    { _env: { MAX_INPUT_CONTEXT_TOKENS: '700000' } }
  );
  assert.equal(value, 700000);
});

test('output tokens are capped by adapter token env limit', () => {
  const value = limits.getOutputLimit(
    { output_generation_limit: 128000 },
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
        {},
        { input_context_default: 5, input_context_max: 1000 },
        {}
      ),
    (err: unknown) => {
      const e = err as LimitValidationError;
      return e.code === 'input_context_limit_exceeded' && e.status === 400;
    }
  );
});

test('user limit validation enforces token step and caps', () => {
  const result = limits.validateUserLimits({
    userValues: { input_context_limit: 5000, output_generation_limit: 8192 },
    categorySettings: { input_context_max: 100000, max_tokens: 4096 },
    providerCfg: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('user limit validation rejects values below token step and adapter caps', () => {
  const belowStep = limits.validateUserLimits({
    userValues: { input_context_limit: 2048 },
    categorySettings: { input_context_max: 100000 },
    providerCfg: {},
  });
  assert.equal(belowStep.ok, false);
  assert.match(belowStep.errors.join('; '), /не меньше 4096/);

  const aboveCaps = limits.validateUserLimits({
    userValues: { input_context_limit: 12288, output_generation_limit: 8192 },
    categorySettings: { input_context_max: 100000, max_tokens: 100000 },
    providerCfg: {
      _env: {
        MAX_INPUT_CONTEXT_TOKENS: '8192',
        MAX_OUTPUT_GENERATION_TOKENS: '4096',
      },
    },
  });
  assert.equal(aboveCaps.ok, false);
  assert.match(aboveCaps.errors.join('; '), /input_context_limit не может быть больше 8192/);
  assert.match(aboveCaps.errors.join('; '), /output_generation_limit не может быть больше 4096/);
});
