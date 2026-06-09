import { Pool, type PoolConfig } from 'pg';
import { resolvePgConnectionString as resolveConnection } from './connection';

const pools = new Map<string, Pool>();

function readPositiveInt(name: string, fallback: number): number {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolvePgConnectionString(): string | null {
  return resolveConnection(process.env);
}

export function getPgPool(connectionString?: string): Pool {
  const resolved = connectionString || resolvePgConnectionString();
  if (!resolved) {
    throw new Error('PostgreSQL: DATABASE_URL или PG_URL не задан');
  }

  if (!pools.has(resolved)) {
    const config: PoolConfig = {
      connectionString: resolved,
      max: readPositiveInt('VECTOR_PG_MAX', 10),
      idleTimeoutMillis: readPositiveInt('VECTOR_PG_IDLE_TIMEOUT_MS', 30000),
      connectionTimeoutMillis: readPositiveInt('VECTOR_PG_CONNECTION_TIMEOUT_MS', 5000),
    };
    const pool = new Pool(config);
    pool.on('error', () => {
      pools.delete(resolved);
      pool.end().catch(() => {});
    });
    pools.set(resolved, pool);
  }

  return pools.get(resolved)!;
}

export async function closePgPools(): Promise<void> {
  const entries = [...pools.entries()];
  pools.clear();
  await Promise.all(entries.map(([, pool]) => pool.end().catch(() => {})));
}
