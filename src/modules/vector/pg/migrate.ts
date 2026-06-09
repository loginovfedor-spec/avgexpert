import fs = require('fs');
import path = require('path');
import { getPgPool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function resolveEmbeddingDims(): number {
  const raw = process.env.EMBEDDING_DIMS || '1024';
  const dims = parseInt(raw, 10);
  if (!Number.isFinite(dims) || dims <= 0) {
    throw new Error(`EMBEDDING_DIMS должен быть положительным числом, получено: ${raw}`);
  }
  return dims;
}

function loadMigrationSql(fileName: string, dims: number): string {
  const sqlPath = path.join(MIGRATIONS_DIR, fileName);
  const template = fs.readFileSync(sqlPath, 'utf8');
  return template.replaceAll('__EMBEDDING_DIMS__', String(dims));
}

export async function runVectorMigrations(options: {
  connectionString?: string;
  dims?: number;
} = {}): Promise<string[]> {
  const dims = options.dims ?? resolveEmbeddingDims();
  const pool = getPgPool(options.connectionString);
  const applied: string[] = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vector_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationId = '001_kb_schema';
    const existing = await client.query(
      'SELECT id FROM vector_migrations WHERE id = $1',
      [migrationId]
    );
    if (existing.rowCount === 0) {
      const sql = loadMigrationSql('001_kb_schema.sql', dims);
      await client.query(sql);
      await client.query('INSERT INTO vector_migrations (id) VALUES ($1)', [migrationId]);
      applied.push(migrationId);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return applied;
}

export async function getPgVectorExtensionVersion(
  connectionString?: string
): Promise<{ installed: boolean; version: string | null }> {
  const pool = getPgPool(connectionString);
  const result = await pool.query(`
    SELECT extversion
    FROM pg_extension
    WHERE extname = 'vector'
  `);
  if (result.rowCount === 0) {
    return { installed: false, version: null };
  }
  return { installed: true, version: result.rows[0].extversion as string };
}
