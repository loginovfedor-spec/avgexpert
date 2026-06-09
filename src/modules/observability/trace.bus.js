const { EventEmitter } = require('events');

class TraceBus extends EventEmitter {
  constructor() {
    super();
    this.traces = [];
    this.MAX_TRACES = 1000;
    this.MAX_TRACE_AGE_MS = 60 * 60 * 1000;
    this.CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

    this.setMaxListeners(50);
    this.cleanupInterval = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Emit a trace event.
   * @param {string} source Component source (e.g., 'ChatService', 'KnowledgeGateway')
   * @param {string} action Action being traced
   * @param {object} metadata Additional metadata including latency, cost, etc.
   */
  emitTrace(source, action, metadata = {}) {
    const trace = {
      timestamp: new Date().toISOString(),
      source,
      action,
      ...metadata
    };
    
    this.traces.push(trace);
    if (this.traces.length > this.MAX_TRACES) {
      this.traces.shift();
    }

    this.emit('trace', trace);
    
    // Sub-events can be added here if needed, but must be handled to avoid ERR_UNHANDLED_ERROR
  }

  getRecentTraces(limit = 100) {
    this.cleanup();
    return this.traces.slice(-limit);
  }

  cleanup(now = Date.now()) {
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

  clear() {
    this.traces = [];
  }
}

module.exports = new TraceBus();
