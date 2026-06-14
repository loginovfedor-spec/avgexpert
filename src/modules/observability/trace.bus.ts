import { EventEmitter } from 'events';

type TraceRecord = {
  timestamp: string;
  source: string;
  action: string;
  [key: string]: unknown;
};

class TraceBus extends EventEmitter {
  traces: TraceRecord[];
  readonly MAX_TRACES = 1000;
  readonly MAX_TRACE_AGE_MS = 60 * 60 * 1000;
  readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    super();
    this.traces = [];
    this.setMaxListeners(50);
    this.cleanupInterval = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  emitTrace(source: string, action: string, metadata: Record<string, unknown> = {}): void {
    const trace: TraceRecord = {
      timestamp: new Date().toISOString(),
      source,
      action,
      ...metadata,
    };

    this.traces.push(trace);
    if (this.traces.length > this.MAX_TRACES) {
      this.traces.shift();
    }

    this.emit('trace', trace);
  }

  getRecentTraces(limit = 100): TraceRecord[] {
    this.cleanup();
    return this.traces.slice(-limit);
  }

  cleanup(now = Date.now()): void {
    if (this.traces.length === 0) return;

    const cutoff = now - this.MAX_TRACE_AGE_MS;
    this.traces = this.traces.filter((trace) => {
      const timestampMs = Date.parse(trace.timestamp);
      return Number.isFinite(timestampMs) && timestampMs >= cutoff;
    });

    if (this.traces.length > this.MAX_TRACES) {
      this.traces = this.traces.slice(-this.MAX_TRACES);
    }
  }

  clear(): void {
    this.traces = [];
  }
}

export = new TraceBus();
