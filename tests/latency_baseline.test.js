/**
 * Latency Measurement Utility
 * Sprint 1/2 deliverable: Baseline P50/P95/P99 + latency budgets.
 *
 * Uses the DeterministicProvider with configurable delays to measure
 * streaming and non-streaming response latencies.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

const { DeterministicProvider } = require('./mocks/deterministic_provider');

/**
 * Collect latency samples from synthetic provider.
 * @param {number} n - Number of samples
 * @param {number} delayMs - Simulated provider delay
 * @returns {Promise<number[]>} Array of elapsed times in ms
 */
async function collectLatencySamples(n, delayMs = 0) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const provider = new DeterministicProvider({ response: 'ok', delayMs });
    const start = performance.now();
    const events = [];
    for await (const event of provider.handleChat(
      [{ role: 'user', content: 'test' }], {}, { stream: true }
    )) {
      events.push(event);
    }
    const elapsed = performance.now() - start;
    samples.push(elapsed);
  }
  return samples;
}

/**
 * Calculate percentiles from sorted samples.
 */
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeStats(samples) {
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

    // Synthetic with 0 delay should be under 50ms P99
    assert.ok(stats.p99 < 50, `P99 should be < 50ms for synthetic provider, got ${stats.p99.toFixed(2)}ms`);
  });

  await t.test('Measures latency with simulated 10ms provider delay', async () => {
    const samples = await collectLatencySamples(SAMPLE_COUNT, 10);
    const stats = computeStats(samples);

    console.log(`\n  Latency Baseline (10ms delay, ${SAMPLE_COUNT} samples):`);
    console.log(`    P50:  ${stats.p50.toFixed(2)}ms`);
    console.log(`    P95:  ${stats.p95.toFixed(2)}ms`);
    console.log(`    P99:  ${stats.p99.toFixed(2)}ms`);

    // With 10ms delay, P50 should be 10-60ms range
    assert.ok(stats.p50 >= 8, `P50 should be >= 8ms with 10ms delay`);
    assert.ok(stats.p99 < 100, `P99 should be < 100ms with 10ms delay`);
  });

  await t.test('Multi-chunk streaming latency', async () => {
    const samples = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const provider = new DeterministicProvider({ chunks: ['a', 'b', 'c', 'd', 'e'] });
      const start = performance.now();
      let ttft = null;
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

    // TTFT should be near-instant for synthetic
    assert.ok(stats.p95 < 20, `TTFT P95 should be < 20ms for synthetic`);
  });
});

/**
 * Latency Budget Definition (SPEC-001 companion)
 * These are target budgets, not enforced in tests yet.
 */
test('Latency Budget Definitions', async (t) => {
  await t.test('Budget values are documented', () => {
    const LATENCY_BUDGETS = {
      AUTH_ROUTING_MS: 10,       // Auth middleware + policy routing
      CONTEXT_LOAD_MS: 20,      // Session/category load from DB
      PROVIDER_TTFT_MS: 2000,   // Time to first token from provider (network)
      TOTAL_FAST_PATH_MS: 3000, // Total budget for fast path chat
      TOTAL_WITH_RAG_MS: 5000,  // Total budget with RAG retrieval
      TOTAL_AGENT_RUN_MS: 30000, // Total budget for AgentRun (with approvals)
    };

    assert.ok(LATENCY_BUDGETS.AUTH_ROUTING_MS > 0);
    assert.ok(LATENCY_BUDGETS.PROVIDER_TTFT_MS > LATENCY_BUDGETS.AUTH_ROUTING_MS);
    assert.ok(LATENCY_BUDGETS.TOTAL_FAST_PATH_MS > LATENCY_BUDGETS.PROVIDER_TTFT_MS);
    assert.ok(LATENCY_BUDGETS.TOTAL_WITH_RAG_MS > LATENCY_BUDGETS.TOTAL_FAST_PATH_MS);
  });
});
