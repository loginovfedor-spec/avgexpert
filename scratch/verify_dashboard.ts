import metricsService from '../src/modules/observability/metrics.service';
import LoadHarness from '../tests/load/load_harness';

async function verifyDashboard(): Promise<void> {
  console.log('--- Verification Started ---');
  const harness = new LoadHarness();

  await harness.run(5, 50);

  const metrics = metricsService.getMetrics();
  console.log('\n--- Metrics After Load ---');
  console.log(JSON.stringify(metrics, null, 2));

  if (metrics.totalRequests > 0 && metrics.latency.p95 > 0) {
    console.log('\n✅ Metrics collection verified.');
  } else {
    console.log('\n❌ Metrics collection FAILED.');
    process.exit(1);
  }
}

verifyDashboard().catch((err) => {
  console.error(err);
  process.exit(1);
});
