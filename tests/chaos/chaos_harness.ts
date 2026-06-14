import { fileURLToPath } from 'url';
import traceBus from '../../src/modules/observability/trace.bus';

const __filename = fileURLToPath(import.meta.url);

/**
 * Chaos Harness — simulates faults and failures.
 */
export default class ChaosHarness {
  running = false;

  async run(durationSeconds = 10): Promise<void> {
    console.log(`Starting Chaos Test: duration=${durationSeconds}s`);
    this.running = true;
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;

    while (Date.now() < endTime && this.running) {
      this._simulateFault();
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
    }

    console.log('Chaos Test Completed.');
    this.running = false;
  }

  _simulateFault(): void {
    const faults = [
      { source: 'ModelGateway', action: 'model.failed', metadata: { error: 'ECONNRESET', code: '502' } },
      { source: 'Temporal', action: 'workflow.restart', metadata: { reason: 'Worker crashed' } },
      { source: 'ToolGateway', action: 'tool.failed', metadata: { error: 'Timeout', code: '408' } },
      { source: 'SandboxManager', action: 'sandbox.failed', metadata: { error: 'Provisioning error' } },
    ];

    const fault = faults[Math.floor(Math.random() * faults.length)];
    traceBus.emitTrace(fault.source, fault.action, fault.metadata);
    console.log(`[Chaos] Injected: ${fault.source}.${fault.action}`);
  }

  stop(): void {
    this.running = false;
  }
}

if (process.argv[1] === __filename) {
  const harness = new ChaosHarness();
  void harness.run(30);
}
