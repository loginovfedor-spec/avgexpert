import test from 'node:test';
import assert from 'node:assert/strict';

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

test('MockRerankerProvider: p95 latency stays within 150ms budget', async () => {
  const { MockRerankerProvider } = await import('../../src/modules/vector/providers/mock.reranker');
  const reranker = new MockRerankerProvider({ latencyMs: 5 });

  const samples: number[] = [];
  for (let i = 0; i < 40; i++) {
    const started = Date.now();
    await reranker.rerank('reactor safety shutdown', [
      'reactor safety shutdown manual',
      'finance quarterly report',
      'misc note',
    ]);
    samples.push(Date.now() - started);
  }

  const p95 = percentile(samples, 95);
  assert.ok(p95 <= 150, `expected p95 <= 150ms, got ${p95}ms`);
});

test('TieredRetriever sage: reports rerankMs in timing result', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { MockRerankerProvider } = await import('../../src/modules/vector/providers/mock.reranker');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const provider = new MockEmbeddingProvider({ dimensions: 8 });
  const reranker = new MockRerankerProvider({ latencyMs: 2 });
  const hits = Array.from({ length: 14 }, (_, i) => ({
    id: `chunk-${i}`,
    namespace: 'ns',
    scope: 'global' as const,
    body: i === 0 ? 'analysis report reactor' : `body ${i}`,
    score: 0.9 - i * 0.01,
    metadata: {},
  }));

  const store = {
    async search() { return hits; },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };

  const retriever = new TieredRetriever(provider, store, 'ns', reranker);
  const result = await retriever.retrieveWithTiming('analysis report', {
    userId: 'user-a',
    tier: 'sage',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.chunks.length, 12);
  assert.ok((result.rerankMs ?? 0) >= 2);
});
