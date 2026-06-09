const test = require('node:test');
const assert = require('node:assert');
const metricsService = require('../../src/modules/observability/metrics.service');
const traceBus = require('../../src/modules/observability/trace.bus');

function resetMetrics() {
  metricsService.metrics = {
    latency: {
      samples: [],
      p50: 0,
      p95: 0,
      p99: 0
    },
    errors: 0,
    totalRequests: 0,
    costUsd: 0
  };
  metricsService.lastPercentileComputeMs = Date.now();
  metricsService.percentilesDirty = false;
}

test('MetricsService: throttles percentile sorting during trace bursts', () => {
  resetMetrics();
  traceBus.clear();

  const originalSort = Array.prototype.sort;
  let sortCalls = 0;
  Array.prototype.sort = function patchedSort(...args) {
    sortCalls++;
    return originalSort.apply(this, args);
  };

  try {
    for (let i = 1; i <= 25; i++) {
      traceBus.emitTrace('test', 'request.completed', { latencyMs: i });
    }

    assert.strictEqual(sortCalls, 0, 'trace burst should not sort samples immediately');

    const snapshot = metricsService.getMetrics();
    assert.strictEqual(sortCalls, 1, 'metrics read should force a single percentile recompute');
    assert.strictEqual(snapshot.latency.p50, 13);
    assert.strictEqual(snapshot.latency.p95, 24);
    assert.strictEqual(snapshot.latency.p99, 25);
  } finally {
    Array.prototype.sort = originalSort;
  }
});
