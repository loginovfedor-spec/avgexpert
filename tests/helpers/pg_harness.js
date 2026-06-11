const { runAppMigrations, seedAppData, closePgPools, isAppPgEnabled } = require('../../src/core/pg');
const { runVectorMigrations } = require('../../src/modules/vector/pg/migrate');

async function ensureTestPg() {
  if (!isAppPgEnabled()) {
    throw new Error('DATABASE_URL is required for tests (SQLite removed in D4)');
  }
  await runAppMigrations();
  await runVectorMigrations();
  await seedAppData();
}

async function teardownTestPg() {
  await closePgPools();
}

module.exports = {
  ensureTestPg,
  teardownTestPg,
};
