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

class SqliteDatabasePort implements DatabasePort {
  constructor(private readonly db: import('better-sqlite3').Database) {}

  async get<T extends Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T | null> {
    const row = this.db.prepare(sql).get(params || {}) as T | undefined;
    return row ?? null;
  }

  async all<T extends Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T[]> {
    return this.db.prepare(sql).all(params || {}) as T[];
  }

  async run(sql: string, params?: QueryParams): Promise<{ changes: number }> {
    const info = this.db.prepare(sql).run(params || {});
    return { changes: info.changes };
  }

  async withTransaction<T>(fn: (db: DatabasePort) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const value = await fn(this);
      this.db.exec('COMMIT');
      return value;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function isAppPgEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_PG_ENABLED === 'false') return false;
  return !!resolvePgConnectionString(env);
}

let sqlitePort: DatabasePort | null = null;
let pgPort: DatabasePort | null = null;

export function getDatabasePort(): DatabasePort {
  if (isAppPgEnabled()) {
    if (!pgPort) {
      pgPort = new PgDatabasePort(getPgPool());
    }
    return pgPort;
  }

  if (!sqlitePort) {
    const db = require('../sqlite');
    sqlitePort = new SqliteDatabasePort(db);
  }
  return sqlitePort;
}

export function resetDatabasePortForTests(): void {
  sqlitePort = null;
  pgPort = null;
}

module.exports = {
  getDatabasePort,
  isAppPgEnabled,
  resetDatabasePortForTests,
};
