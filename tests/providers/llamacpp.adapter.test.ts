import test from 'node:test';
import assert from 'node:assert/strict';
import llamacpp from '../../src/modules/providers/adapters/llamacpp';

test('LlamaCppProvider normalizes base URL with /v1 suffix', () => {
  assert.equal(llamacpp.normalizeBaseUrl('http://127.0.0.1:8201'), 'http://127.0.0.1:8201/v1');
  assert.equal(llamacpp.normalizeBaseUrl('http://127.0.0.1:8201/v1/'), 'http://127.0.0.1:8201/v1');
});

test('LlamaCppProvider maps sampling params and strips gateway-only extra_params', () => {
  const params = llamacpp.buildCompletionParams(
    {
      model_name: 'qwen2.5-7b-instruct',
      temperature: 0.4,
      top_p: 0.9,
      top_k: 40,
      min_p: 0.05,
      repeat_penalty: 1.1,
      extra_params: {
        global_kb_enabled: true,
        top_k: 99,
        seed: 42,
      },
    },
    { stream: true, max_tokens: 1024 }
  );

  assert.equal(params.model, 'qwen2.5-7b-instruct');
  assert.equal(params.stream, true);
  assert.equal(params.max_tokens, 1024);
  assert.equal(params.temperature, 0.4);
  assert.equal(params.top_p, 0.9);
  assert.equal(params.top_k, 40);
  assert.equal(params.min_p, 0.05);
  assert.equal(params.repeat_penalty, 1.1);
  assert.equal(params.seed, 42);
  assert.equal(params.global_kb_enabled, undefined);
});

test('LlamaCppProvider checkHealth uses /health endpoint', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url) => {
    assert.equal(url, 'http://127.0.0.1:8201/health');
    return { ok: true };
  }) as typeof fetch;

  try {
    const ok = await llamacpp.checkHealth({ endpoint_url: 'http://127.0.0.1:8201' });
    assert.equal(ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
