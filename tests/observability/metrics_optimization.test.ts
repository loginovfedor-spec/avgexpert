import test from 'node:test';
import assert from 'node:assert';
import metricsService from '../../src/modules/observability/metrics.service';
import traceBus from '../../src/modules/observability/trace.bus';

type MutableMetricsService = {
  metrics: {
    latency: { samples: number[]; p50: number; p95: number; p99: number };
    errors: number;
    totalRequests: number;
    costUsd: number;
  };
  lastPercentileComputeMs: number;
  percentilesDirty: boolean;
  getMetrics(): ReturnType<typeof metricsService.getMetrics>;
};

function resetMetrics(): void {
  const metrics = metricsService as unknown as MutableMetricsService;
  metrics.metrics = {
    latency: {
      samples: [],
      p50: 0,
      p95: 0,
      p99: 0,
    },
    errors: 0,
    totalRequests: 0,
    costUsd: 0,
  };
  metrics.lastPercentileComputeMs = Date.now();
  metrics.percentilesDirty = false;
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
      traceBus.emitTrace('ChatService', 'model.completed', { latencyMs: i });
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

test('MetricsService: counts model.completed only from ChatService or ChatController', () => {
  resetMetrics();
  traceBus.clear();

  traceBus.emitTrace('ModelGateway', 'model.completed', { latencyMs: 100, costUsd: 0.99 });
  traceBus.emitTrace('ChatService', 'model.completed', { latencyMs: 200, costUsd: 0.5 });

  const snapshot = metricsService.getMetrics();
  assert.strictEqual(snapshot.totalRequests, 1, 'ModelGateway must not increment totalRequests');
  assert.strictEqual(snapshot.costUsd, 0.5, 'costUsd only from ChatService/ChatController');

  resetMetrics();
  traceBus.emitTrace('ChatController', 'model.completed', { latencyMs: 50, costUsd: 0.25 });
  traceBus.emitTrace('ModelGateway', 'model.completed', { latencyMs: 50, costUsd: 0.99 });
  traceBus.emitTrace('ChatService', 'model.completed', { latencyMs: 50, costUsd: 0.25 });

  const mixed = metricsService.getMetrics();
  assert.strictEqual(mixed.totalRequests, 2);
  assert.strictEqual(mixed.costUsd, 0.5);
});
