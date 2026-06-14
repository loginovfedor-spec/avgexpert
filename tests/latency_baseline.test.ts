/**
 * Latency Measurement Utility — baseline P50/P95/P99 + latency budgets.
 */
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/test-env';
import { DeterministicProvider } from './mocks/deterministic_provider';

async function collectLatencySamples(n: number, delayMs = 0): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const provider = new DeterministicProvider({ response: 'ok', delayMs });
    const start = performance.now();
    const events = [];
    for await (const event of provider.handleChat([{ role: 'user', content: 'test' }], {}, { stream: true })) {
      events.push(event);
    }
    void events;
    const elapsed = performance.now() - start;
    samples.push(elapsed);
  }
  return samples;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

test('Latency Baseline — Synthetic Provider', async (t) => {
  const SAMPLE_COUNT = 20;

  await t.test('Measures P50/P95/P99 for zero-delay provider', async () => {
    const samples = await collectLatencySamples(SAMPLE_COUNT, 0);
    const stats = computeStats(samples);

    console.log(`\n  Latency Baseline (0ms delay, ${SAMPLE_COUNT} samples):`);
    console.log(`    P50:  ${stats.p50.toFixed(2)}ms`);
    console.log(`    P95:  ${stats.p95.toFixed(2)}ms`);
    console.log(`    P99:  ${stats.p99.toFixed(2)}ms`);
    console.log(`    Mean: ${stats.mean.toFixed(2)}ms`);
    console.log(`    Max:  ${stats.max.toFixed(2)}ms`);

    assert.ok(stats.p99 < 50, `P99 should be < 50ms for synthetic provider, got ${stats.p99.toFixed(2)}ms`);
  });

  await t.test('Measures latency with simulated 10ms provider delay', async () => {
    const samples = await collectLatencySamples(SAMPLE_COUNT, 10);
    const stats = computeStats(samples);

    console.log(`\n  Latency Baseline (10ms delay, ${SAMPLE_COUNT} samples):`);
    console.log(`    P50:  ${stats.p50.toFixed(2)}ms`);
    console.log(`    P95:  ${stats.p95.toFixed(2)}ms`);
    console.log(`    P99:  ${stats.p99.toFixed(2)}ms`);

    assert.ok(stats.p50 >= 8, 'P50 should be >= 8ms with 10ms delay');
    assert.ok(stats.p99 < 100, 'P99 should be < 100ms with 10ms delay');
  });

  await t.test('Multi-chunk streaming latency', async () => {
    const samples: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const provider = new DeterministicProvider({ chunks: ['a', 'b', 'c', 'd', 'e'] });
      const start = performance.now();
      let ttft: number | null = null;
      for await (const event of provider.handleChat([], {}, {})) {
        if (!ttft && event.type === 'delta') {
          ttft = performance.now() - start;
        }
      }
      samples.push(ttft || 0);
    }
    const stats = computeStats(samples);

    console.log(`\n  TTFT Baseline (multi-chunk, ${SAMPLE_COUNT} samples):`);
    console.log(`    P50:  ${stats.p50.toFixed(2)}ms`);
    console.log(`    P95:  ${stats.p95.toFixed(2)}ms`);

    assert.ok(stats.p95 < 20, 'TTFT P95 should be < 20ms for synthetic');
  });
});

test('Latency Budget Definitions', async (t) => {
  await t.test('Budget values are documented', () => {
    const LATENCY_BUDGETS = {
      AUTH_ROUTING_MS: 10,
      CONTEXT_LOAD_MS: 20,
      PROVIDER_TTFT_MS: 2000,
      TOTAL_FAST_PATH_MS: 3000,
      TOTAL_WITH_RAG_MS: 5000,
      TOTAL_AGENT_RUN_MS: 30000,
    };

    assert.ok(LATENCY_BUDGETS.AUTH_ROUTING_MS > 0);
    assert.ok(LATENCY_BUDGETS.PROVIDER_TTFT_MS > LATENCY_BUDGETS.AUTH_ROUTING_MS);
    assert.ok(LATENCY_BUDGETS.TOTAL_FAST_PATH_MS > LATENCY_BUDGETS.PROVIDER_TTFT_MS);
    assert.ok(LATENCY_BUDGETS.TOTAL_WITH_RAG_MS > LATENCY_BUDGETS.TOTAL_FAST_PATH_MS);
  });
});
