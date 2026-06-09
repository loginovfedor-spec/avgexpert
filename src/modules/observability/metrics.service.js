const traceBus = require('./trace.bus');

class MetricsService {
  constructor() {
    this.metrics = {
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
    
    this.MAX_SAMPLES = 500;
    this.RECOMPUTE_INTERVAL_MS = 1000;
    this.lastPercentileComputeMs = 0;
    this.percentilesDirty = false;
    
    // Wire up to trace bus
    traceBus.on('trace', (trace) => this._onTrace(trace));
  }

  _onTrace(trace) {
    this.metrics.totalRequests++;
    
    if (trace.latencyMs) {
      this._addLatencySample(trace.latencyMs);
    }
    
    if (trace.error) {
      this.metrics.errors++;
    }
    
    if (trace.costUsd) {
      this.metrics.costUsd += trace.costUsd;
    }
  }

  _addLatencySample(sample) {
    this.metrics.latency.samples.push(sample);
    if (this.metrics.latency.samples.length > this.MAX_SAMPLES) {
      this.metrics.latency.samples.shift();
    }
    this.percentilesDirty = true;
    this._recomputePercentiles(false);
  }

  _recomputePercentiles(force = true) {
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

  _percentile(sorted, p) {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getMetrics() {
    this._recomputePercentiles(true);
    return {
      ...this.metrics,
      errorRate: this.metrics.totalRequests > 0 ? (this.metrics.errors / this.metrics.totalRequests) : 0
    };
  }
}

module.exports = new MetricsService();
