import test from 'node:test';
import assert from 'node:assert';
import { validateDataset, runSmokeEval } from './rag_recall.eval';

test('S0-7: RU recall dataset meets size and referential integrity', () => {
  assert.doesNotThrow(() => validateDataset());
});

test('S0-7: recall metrics smoke eval runs', () => {
  const report = runSmokeEval();
  assert.ok(report.summary.count >= 30);
  assert.ok(report.summary.recall_at_3 >= 0 && report.summary.recall_at_3 <= 1);
});
