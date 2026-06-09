import test from 'node:test';
import assert from 'node:assert/strict';

test('SelfHostedRerankerProvider: maps TEI /rerank response by index', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify([
      { index: 1, score: 0.92 },
      { index: 0, score: 0.41 },
    ]),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  try {
    const { SelfHostedRerankerProvider } = await import(
      '../../src/modules/vector/providers/selfhosted.reranker'
    );
    const reranker = new SelfHostedRerankerProvider({
      model: 'bge-reranker-v2-m3',
      apiUrl: 'http://127.0.0.1:8091/rerank',
    });

    const scores = await reranker.rerank('reactor safety', ['generic note', 'reactor safety manual']);
    assert.deepEqual(scores, [0.41, 0.92]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SelfHostedRerankerProvider: empty texts returns empty scores', async () => {
  const { SelfHostedRerankerProvider } = await import(
    '../../src/modules/vector/providers/selfhosted.reranker'
  );
  const reranker = new SelfHostedRerankerProvider({
    model: 'bge-reranker-v2-m3',
    apiUrl: 'http://127.0.0.1:8091/rerank',
  });

  const scores = await reranker.rerank('query', []);
  assert.deepEqual(scores, []);
});
