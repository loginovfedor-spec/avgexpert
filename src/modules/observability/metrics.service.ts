import traceBus from './trace.bus';
type TraceEvent = {
  source?: string;
  action?: string;
  latencyMs?: number;
  error?: unknown;
  costUsd?: number;
  [key: string]: unknown;
};

const CHAT_COMPLETION_SOURCES = new Set(['ChatService', 'ChatController']);

function isChatCompletionTrace(trace: TraceEvent): boolean {
  return trace.action === 'model.completed'
    && typeof trace.source === 'string'
    && CHAT_COMPLETION_SOURCES.has(trace.source);
}

type LatencyMetrics = {
  samples: number[];
  p50: number;
  p95: number;
  p99: number;
};

type MetricsSnapshot = {
  latency: LatencyMetrics;
  errors: number;
  totalRequests: number;
  costUsd: number;
  errorRate: number;
};

class MetricsService {
  private readonly metrics: {
    latency: LatencyMetrics;
    errors: number;
    totalRequests: number;
    costUsd: number;
  };
  private readonly MAX_SAMPLES = 500;
  private readonly RECOMPUTE_INTERVAL_MS = 1000;
  private lastPercentileComputeMs = 0;
  private percentilesDirty = false;

  constructor() {
    this.metrics = {
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

    traceBus.on('trace', (trace: TraceEvent) => this._onTrace(trace));
  }

  private _onTrace(trace: TraceEvent): void {
    const isChatCompletion = isChatCompletionTrace(trace);
    const isChatFailed = trace.action === 'model.failed'
      && typeof trace.source === 'string'
      && CHAT_COMPLETION_SOURCES.has(trace.source);

    if (isChatCompletion) {
      this.metrics.totalRequests++;
      if (trace.latencyMs) {
        this._addLatencySample(trace.latencyMs);
      }
      if (trace.costUsd) {
        this.metrics.costUsd += trace.costUsd;
      }
    }

    if (isChatFailed) {
      this.metrics.totalRequests++;
      this.metrics.errors++;
    }
  }

  private _addLatencySample(sample: number): void {
    this.metrics.latency.samples.push(sample);
    if (this.metrics.latency.samples.length > this.MAX_SAMPLES) {
      this.metrics.latency.samples.shift();
    }
    this.percentilesDirty = true;
    this._recomputePercentiles(false);
  }

  private _recomputePercentiles(force = true): void {
    if (!this.percentilesDirty && !force) return;

    const now = Date.now();
    if (!force && now - this.lastPercentileComputeMs < this.RECOMPUTE_INTERVAL_MS) {
      return;
    }

    const sorted = [...this.metrics.latency.samples].sort((a, b) => a - b);
    if (sorted.length === 0) return;

    this.metrics.latency.p50 = this._percentile(sorted, 50);
    this.metrics.latency.p95 = this._percentile(sorted, 95);
    this.metrics.latency.p99 = this._percentile(sorted, 99);
    this.lastPercentileComputeMs = now;
    this.percentilesDirty = false;
  }

  private _percentile(sorted: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getMetrics(): MetricsSnapshot {
    this._recomputePercentiles(true);
    return {
      ...this.metrics,
      errorRate: this.metrics.totalRequests > 0
        ? (this.metrics.errors / this.metrics.totalRequests)
        : 0,
    };
  }
}

export = new MetricsService();
