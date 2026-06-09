const test = require('node:test');
const assert = require('node:assert');
const { validateDataset, runSmokeEval } = require('./rag_recall.eval');

test('S0-7: RU recall dataset meets size and referential integrity', () => {
  assert.doesNotThrow(() => validateDataset());
});

test('S0-7: recall metrics smoke eval runs', () => {
  const report = runSmokeEval();
  assert.ok(report.summary.count >= 30);
  assert.ok(report.summary.recall_at_3 >= 0 && report.summary.recall_at_3 <= 1);
});
