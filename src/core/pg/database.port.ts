import type { Pool, PoolClient } from 'pg';
import { getPgPool } from './pool';
import { resolvePgConnectionString } from './connection';

export type QueryParams = Record<string, unknown>;

export interface DatabasePort {
  get<T extends Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T | null>;
  all<T extends Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T[]>;
  run(sql: string, params?: QueryParams): Promise<{ changes: number }>;
  withTransaction<T>(fn: (db: DatabasePort) => Promise<T>): Promise<T>;
}

function namedToPositional(sql: string, params: QueryParams = {}): { text: string; values: unknown[] } {
  const keys: string[] = [];
  const text = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key: string) => {
    if (!keys.includes(key)) keys.push(key);
    return `$${keys.indexOf(key) + 1}`;
  });
  const values = keys.map((key) => params[key]);
  return { text, values };
}

class PgDatabasePort implements DatabasePort {
  constructor(private readonly executor: Pool | PoolClient) {}

  async get<T extends Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T | null> {
    const { text, values } = namedToPositional(sql, params);
    const result = await this.executor.query(text, values);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T extends Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T[]> {
    const { text, values } = namedToPositional(sql, params);
    const result = await this.executor.query(text, values);
    return result.rows as T[];
  }

  async run(sql: string, params?: QueryParams): Promise<{ changes: number }> {
    const { text, values } = namedToPositional(sql, params);
    const result = await this.executor.query(text, values);
    return { changes: result.rowCount ?? 0 };
  }

  async withTransaction<T>(fn: (db: DatabasePort) => Promise<T>): Promise<T> {
    if (this.isPoolClient()) {
      return fn(this);
    }
    const pool = this.executor as Pool;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PgDatabasePort(client);
      const value = await fn(tx);
      await client.query('COMMIT');
      return value;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private isPoolClient(): boolean {
    return typeof (this.executor as PoolClient).release === 'function';
  }
}

export function isAppPgEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_PG_ENABLED === 'false') return false;
  return !!resolvePgConnectionString(env);
}

let pgPort: DatabasePort | null = null;

export function getDatabasePort(): DatabasePort {
  if (!isAppPgEnabled()) {
    throw new Error('DATABASE_URL is required (SQLite removed in D4)');
  }
  if (!pgPort) {
    pgPort = new PgDatabasePort(getPgPool());
  }
  return pgPort;
}

export function resetDatabasePortForTests(): void {
  pgPort = null;
}

