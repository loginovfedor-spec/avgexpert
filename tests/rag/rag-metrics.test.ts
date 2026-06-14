import test from 'node:test';
import assert from 'node:assert/strict';
import traceBus from '../../src/modules/observability/trace.bus';
import ragMetrics from '../../src/modules/observability/rag-metrics.service';

test('rag-metrics.service tracks retrieval latency and semantic quality', async () => {

  traceBus.emitTrace('RagOrchestrator', 'retrieval.completed', {
    latencyMs: 120,
    embedMs: 40,
    searchMs: 70,
    degraded: false,
    maxChunkScore: 0.82,
    cacheHit: false,
  });
  traceBus.emitTrace('RagOrchestrator', 'retrieval.completed', {
    latencyMs: 200,
    embedMs: 60,
    searchMs: 120,
    degraded: true,
    maxChunkScore: 0.55,
    cacheHit: false,
  });
  traceBus.emitTrace('RagOrchestrator', 'rag.cache_hit', {
    latencyMs: 5,
  });

  const snapshot = ragMetrics.getSnapshot();
  assert.equal(snapshot.retrieval_count, 2);
  assert.equal(snapshot.cache_hit_count, 1);
  assert.equal(snapshot.degraded_count, 1);
  assert.equal(snapshot.degraded_rate, 0.5);
  assert.ok(snapshot.rag_latency_ms.p95 >= snapshot.rag_latency_ms.p50);
  assert.ok(snapshot.semantic_quality_score != null);
  assert.ok(Math.abs(snapshot.semantic_quality_score - 0.685) < 0.01);
});
