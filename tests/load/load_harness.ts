import { fileURLToPath } from 'url';
import traceBus from '../../src/modules/observability/trace.bus';

const __filename = fileURLToPath(import.meta.url);

/**
 * Load Harness — simulates high volume of events to test observability and metrics.
 */
export default class LoadHarness {
  running = false;

  async run(durationSeconds = 10, intensity = 10): Promise<void> {
    console.log(`Starting Load Test: duration=${durationSeconds}s, intensity=${intensity} events/s`);
    this.running = true;
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;

    let eventCount = 0;

    while (Date.now() < endTime && this.running) {
      this._simulateEvent();
      eventCount++;
      await new Promise((r) => setTimeout(r, 1000 / intensity));
    }

    console.log(`Load Test Completed: ${eventCount} events emitted.`);
    this.running = false;
  }

  _simulateEvent(): void {
    const types = ['model.completed', 'retrieval.completed', 'tool.completed', 'sandbox.command.completed'];
    const type = types[Math.floor(Math.random() * types.length)];
    const latencyMs = 50 + Math.random() * 500;
    const isError = Math.random() < 0.05;

    traceBus.emitTrace('LoadHarness', type, {
      latencyMs,
      error: isError ? 'Simulated error' : null,
      costUsd: Math.random() * 0.01,
      runId: 'load-' + Math.random().toString(36).substring(7),
    });
  }

  stop(): void {
    this.running = false;
  }
}

if (process.argv[1] === __filename) {
  const harness = new LoadHarness();
  void harness.run(30, 20);
}
