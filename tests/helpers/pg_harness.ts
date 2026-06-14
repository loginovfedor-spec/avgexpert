import { Pool } from 'pg';
import {
  runAppMigrations,
  seedAppData,
  closePgPools,
  isAppPgEnabled,
  resolvePgConnectionString,
} from '../../src/core/pg';
import { runVectorMigrations } from '../../src/modules/vector/pg/migrate';

export async function canReachTestPg(): Promise<boolean> {
  if (process.env.SKIP_PG_INTEGRATION === 'true') return false;
  if (!isAppPgEnabled()) return false;

  const connectionString = resolvePgConnectionString();
  if (!connectionString) return false;

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 2000,
    max: 1,
  });

  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function ensureTestPg(): Promise<void> {
  if (!(await canReachTestPg())) {
    throw new Error(
      'PostgreSQL is not reachable at DATABASE_URL. ' +
        'Start Docker PG 18: docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d postgres'
    );
  }
  await runAppMigrations();
  await runVectorMigrations();
  await seedAppData();
}

export async function teardownTestPg(): Promise<void> {
  await closePgPools();
}
