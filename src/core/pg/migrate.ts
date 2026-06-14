import fs from 'fs';
import path from 'path';
import { getPgPool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const MIGRATIONS: Array<{ id: string; file: string }> = [
  { id: '001_app_core', file: '001_app_core.sql' },
  { id: '002_app_chat', file: '002_app_chat.sql' },
  { id: '003_app_approvals', file: '003_app_approvals.sql' },
  { id: '004_app_cost', file: '004_app_cost.sql' },
  { id: '005_billing_system', file: '005_billing_system.sql' },
  { id: '006_sprint4_init', file: '006_sprint4_init.sql' },
  { id: '007_request_id_text', file: '007_request_id_text.sql' },
  { id: '008_payment_orders_credits', file: '008_payment_orders_credits.sql' },
];

const APP_MIGRATION_LOCK_KEY = 83457292;

export async function runAppMigrations(options: {
  connectionString?: string;
} = {}): Promise<string[]> {
  const pool = getPgPool(options.connectionString);
  const applied: string[] = [];
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [APP_MIGRATION_LOCK_KEY]);
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const migration of MIGRATIONS) {
      const existing = await client.query(
        'SELECT id FROM app_migrations WHERE id = $1',
        [migration.id]
      );
      if (existing.rowCount === 0) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migration.file), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO app_migrations (id) VALUES ($1)', [migration.id]);
        applied.push(migration.id);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [APP_MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }

  return applied;
}
