import logger = require('../logger');
import { isAppPgEnabled } from './database.port';
import { runAppMigrations } from './migrate';
import { seedAppData } from './seed';

const log = logger.scoped('AppPg');

let initPromise: Promise<void> | null = null;

export async function initAppPg(): Promise<void> {
  if (!isAppPgEnabled()) return;
  if (!initPromise) {
    initPromise = (async () => {
      const applied = await runAppMigrations();
      if (applied.length > 0) {
        log.info('Applied app migrations', { applied });
      }
      await seedAppData();
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function ensureAppPgReady(): Promise<void> {
  await initAppPg();
}

export {
  getDatabasePort,
  isAppPgEnabled,
  resetDatabasePortForTests,
} from './database.port';
export { runAppMigrations } from './migrate';
export { seedAppData } from './seed';
export { getPgPool, closePgPools } from './pool';
export { resolvePgConnectionString } from './connection';

module.exports = {
  initAppPg,
  ensureAppPgReady,
  getDatabasePort: require('./database.port').getDatabasePort,
  isAppPgEnabled: require('./database.port').isAppPgEnabled,
  resetDatabasePortForTests: require('./database.port').resetDatabasePortForTests,
  runAppMigrations,
  seedAppData,
  getPgPool: require('./pool').getPgPool,
  closePgPools: require('./pool').closePgPools,
  resolvePgConnectionString: require('./connection').resolvePgConnectionString,
};
