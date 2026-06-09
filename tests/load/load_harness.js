const traceBus = require('../../src/modules/observability/trace.bus');

/**
 * Load Harness — simulates high volume of events to test observability and metrics.
 */
class LoadHarness {
  constructor() {
    this.running = false;
  }

  async run(durationSeconds = 10, intensity = 10) {
    console.log(`Starting Load Test: duration=${durationSeconds}s, intensity=${intensity} events/s`);
    this.running = true;
    const startTime = Date.now();
    const endTime = startTime + (durationSeconds * 1000);
    
    let eventCount = 0;
    
    while (Date.now() < endTime && this.running) {
      this._simulateEvent();
      eventCount++;
      await new Promise(r => setTimeout(r, 1000 / intensity));
    }
    
    console.log(`Load Test Completed: ${eventCount} events emitted.`);
    this.running = false;
  }

  _simulateEvent() {
    const types = ['model.completed', 'retrieval.completed', 'tool.completed', 'sandbox.command.completed'];
    const type = types[Math.floor(Math.random() * types.length)];
    const latencyMs = 50 + Math.random() * 500;
    const isError = Math.random() < 0.05;
    
    traceBus.emitTrace('LoadHarness', type, {
      latencyMs,
      error: isError ? 'Simulated error' : null,
      costUsd: Math.random() * 0.01,
      runId: 'load-' + Math.random().toString(36).substring(7)
    });
  }

  stop() {
    this.running = false;
  }
}

if (require.main === module) {
  const harness = new LoadHarness();
  harness.run(30, 20); // 30s at 20 events/s
}

module.exports = LoadHarness;
