import path from 'path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COMPOSE = [
  'compose',
  '--env-file',
  'deploy/prod/.env',
  '-f',
  'deploy/prod/compose.yml',
];

const ROOT = path.join(__dirname, '..');
const WAIT_MS = parseInt(process.env.PG_ENSURE_WAIT_MS || '120000', 10);
const POLL_MS = 2000;

function connectionString(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.PG_URL ||
    'postgresql://avg:d0smoke-test-pw@127.0.0.1:5432/avgexpert'
  );
}

async function pingPg(): Promise<boolean> {
  const pool = new Pool({
    connectionString: connectionString(),
    connectionTimeoutMillis: 3000,
    max: 1,
  });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err: any) {
    console.warn('[ensure_pg] pingPg failed:', err.message || err);
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

function runDockerCompose(args: string[]): number {
  const result = spawnSync('docker', [...COMPOSE, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

async function waitForPg(): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    if (await pingPg()) {
      console.log('[ensure_pg] PostgreSQL ready at', connectionString().replace(/:[^:@/]+@/, ':***@'));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(
    `[ensure_pg] PostgreSQL not ready within ${WAIT_MS}ms. ` +
      'Check: docker ps | findstr avgexpert-pg'
  );
}

async function main(): Promise<void> {
  if (await pingPg()) {
    console.log('[ensure_pg] PostgreSQL already reachable');
    return;
  }

  console.log('[ensure_pg] Starting avgexpert-pg (PG 18)...');
  const code = runDockerCompose(['up', '-d', 'postgres']);
  if (code !== 0) {
    process.exit(code);
  }
  await waitForPg();
}

main().catch((err: unknown) => {
  console.error('[ensure_pg]', err instanceof Error ? err.message : err);
  process.exit(1);
});
