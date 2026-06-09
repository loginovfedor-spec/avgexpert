// @ts-ignore
import traceBus = require('./trace.bus');

type Percentiles = {
  p50: number;
  p95: number;
};

type RagMetricsSnapshot = {
  retrieval_count: number;
  cache_hit_count: number;
  degraded_count: number;
  cache_hit_rate: number;
  degraded_rate: number;
  rag_latency_ms: Percentiles;
  embed_latency_ms: Percentiles;
  search_latency_ms: Percentiles;
  semantic_quality_score: number | null;
  last_retrieval_at: string | null;
};

class RagMetricsService {
  private readonly maxSamples = 500;
  private retrievalCount = 0;
  private cacheHitCount = 0;
  private degradedCount = 0;
  private latencySamples: number[] = [];
  private embedSamples: number[] = [];
  private searchSamples: number[] = [];
  private scoreSamples: number[] = [];
  private lastRetrievalAt: string | null = null;

  constructor() {
    traceBus.on('trace', (trace: Record<string, unknown>) => this.onTrace(trace));
  }

  private onTrace(trace: Record<string, unknown>): void {
    if (trace.source !== 'RagOrchestrator') return;

    const action = String(trace.action || '');
    if (action === 'rag.cache_hit') {
      this.cacheHitCount += 1;
      this.pushSample(this.latencySamples, Number(trace.latencyMs));
      return;
    }

    if (action !== 'retrieval.completed') return;

    this.retrievalCount += 1;
    this.lastRetrievalAt = String(trace.timestamp || new Date().toISOString());

    if (trace.cacheHit) {
      this.cacheHitCount += 1;
    }
    if (trace.degraded) {
      this.degradedCount += 1;
    }

    this.pushSample(this.latencySamples, Number(trace.latencyMs));
    this.pushSample(this.embedSamples, Number(trace.embedMs));
    this.pushSample(this.searchSamples, Number(trace.searchMs));

    const maxScore = Number(trace.maxChunkScore);
    if (Number.isFinite(maxScore) && maxScore > 0) {
      this.pushSample(this.scoreSamples, maxScore);
    }
  }

  private pushSample(bucket: number[], value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    bucket.push(value);
    if (bucket.length > this.maxSamples) {
      bucket.shift();
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  private computePercentiles(samples: number[]): Percentiles {
    if (samples.length === 0) {
      return { p50: 0, p95: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
    };
  }

  getSnapshot(): RagMetricsSnapshot {
    const total = this.retrievalCount + this.cacheHitCount;
    const semanticQuality = this.scoreSamples.length > 0
      ? this.scoreSamples.reduce((sum, v) => sum + v, 0) / this.scoreSamples.length
      : null;

    return {
      retrieval_count: this.retrievalCount,
      cache_hit_count: this.cacheHitCount,
      degraded_count: this.degradedCount,
      cache_hit_rate: total > 0 ? this.cacheHitCount / total : 0,
      degraded_rate: this.retrievalCount > 0 ? this.degradedCount / this.retrievalCount : 0,
      rag_latency_ms: this.computePercentiles(this.latencySamples),
      embed_latency_ms: this.computePercentiles(this.embedSamples),
      search_latency_ms: this.computePercentiles(this.searchSamples),
      semantic_quality_score: semanticQuality,
      last_retrieval_at: this.lastRetrievalAt,
    };
  }
}

const ragMetricsService = new RagMetricsService();

module.exports = ragMetricsService;
