import test from 'node:test';
import assert from 'node:assert/strict';
import { asMock } from '../helpers/cast';
import type { VectorStore } from '../../src/modules/vector/ports/vector.store';

const NFR1_P95_MS = 300;
const CONCURRENCY = 16;
const ROUNDS = 4;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function runConcurrentRetrieval(
  retriever: {
    retrieveWithTiming: (
      query: string,
      ctx: {
        userId: string;
        tier: 'consultant';
        scopes: ['global'];
        globalKbEnabled: boolean;
      }
    ) => Promise<{ embedMs: number; searchMs: number; chunks: unknown[] }>;
  },
  query: string
): Promise<number> {
  const started = Date.now();
  const tasks = Array.from({ length: CONCURRENCY }, () =>
    retriever.retrieveWithTiming(query, {
      userId: 'load-user',
      tier: 'consultant',
      scopes: ['global'],
      globalKbEnabled: true,
    })
  );
  await Promise.all(tasks);
  return Date.now() - started;
}

test('S9-3: concurrent consultant retrieval p95 within NFR-1 (mock embedder)', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const provider = new MockEmbeddingProvider({ dimensions: 16 });
  const hits = Array.from({ length: 8 }, (_, i) => ({
    id: `chunk-${i}`,
    namespace: 'ns-load',
    scope: 'global' as const,
    body: `reactor safety procedure ${i}`,
    score: 0.95 - i * 0.02,
    metadata: { doc_type: 'canonical_book' },
  }));

  const store = {
    async search() {
      return hits;
    },
    async upsert() {},
    async delete() {
      return 0;
    },
    async health() {
      return true;
    },
  };

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), 'ns-load');
  const samples: number[] = [];

  for (let round = 0; round < ROUNDS; round++) {
    samples.push(await runConcurrentRetrieval(retriever, `shutdown sequence round ${round}`));
  }

  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);

  console.log(`\n  S9-3 retrieval load (mock, ${CONCURRENCY} concurrent × ${ROUNDS} rounds):`);
  console.log(`    p50: ${p50}ms`);
  console.log(`    p95: ${p95}ms (NFR-1 budget: ${NFR1_P95_MS}ms)`);

  assert.ok(p95 <= NFR1_P95_MS, `expected p95 <= ${NFR1_P95_MS}ms, got ${p95}ms`);
});

test('S9-3: single retrieval reports embed/search timing', async () => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');

  const provider = new MockEmbeddingProvider({ dimensions: 8 });
  const store = {
    async search() {
      return [{
        id: 'c1',
        namespace: 'ns',
        scope: 'global' as const,
        body: 'manual',
        score: 0.9,
        metadata: {},
      }];
    },
    async upsert() {},
    async delete() {
      return 0;
    },
    async health() {
      return true;
    },
  };

  const retriever = new TieredRetriever(provider, asMock<VectorStore>(store), 'ns');
  const result = await retriever.retrieveWithTiming('query', {
    userId: 'u1',
    tier: 'consultant',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.ok(result.embedMs >= 0);
  assert.ok(result.searchMs >= 0);
  assert.equal(result.chunks.length, 1);
});
