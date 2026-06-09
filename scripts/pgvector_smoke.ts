/**
 * S1-6: smoke-check PostgreSQL + pgvector для VectorKB.
 *
 * Запуск:
 *   DATABASE_URL=postgresql://... npm run kb:pg:smoke
 *   npm run kb:pg:smoke -- --host=83.166.253.250
 */
import path = require('path');
import dotenv = require('dotenv');
import { getPgVectorExtensionVersion, runVectorMigrations } from '../src/modules/vector/pg/migrate';
import { closePgPools, getPgPool } from '../src/modules/vector/pg/pool';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ARGS = process.argv.slice(2);
const HOST_FLAG = ARGS.find(a => a.startsWith('--host='))?.split('=')[1];

function isPgVectorAtLeast(version: string, minMinor: number): boolean {
  const parts = version.split('.').map(part => parseInt(part, 10));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  if (major > 0) return true;
  return minor >= minMinor;
}

async function main(): Promise<void> {
  const { resolvePgConnectionString } = await import('../src/modules/vector/pg/connection');
  const connectionString = resolvePgConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL не задан (process.env или providers/config/*.env)');
  }

  if (HOST_FLAG) {
    const url = new URL(connectionString);
    if (url.hostname !== HOST_FLAG) {
      console.warn(`[smoke] warning: DATABASE_URL host=${url.hostname}, ожидался --host=${HOST_FLAG}`);
    } else {
      console.log(`[smoke] target host OK: ${HOST_FLAG}`);
    }
  }

  const pool = getPgPool(connectionString);
  const ping = await pool.query('SELECT version() AS version');
  console.log(`[smoke] PostgreSQL: ${ping.rows[0].version}`);

  const ext = await getPgVectorExtensionVersion(connectionString);
  if (!ext.installed || !ext.version) {
    throw new Error('pgvector extension не установлен');
  }
  console.log(`[smoke] pgvector version: ${ext.version}`);

  if (!isPgVectorAtLeast(ext.version, 5)) {
    throw new Error(`pgvector ${ext.version} < 0.5 — HNSW недоступен`);
  }
  console.log('[smoke] pgvector >= 0.5: OK');

  const applied = await runVectorMigrations({ connectionString });
  console.log(`[smoke] migrations: ${applied.length ? applied.join(', ') : 'already applied'}`);

  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('kb_documents', 'kb_chunks')
    ORDER BY table_name
  `);
  const tableNames = tables.rows.map(row => row.table_name);
  for (const required of ['kb_documents', 'kb_chunks']) {
    if (!tableNames.includes(required)) {
      throw new Error(`таблица ${required} не найдена после миграции`);
    }
  }
  console.log('[smoke] tables kb_documents, kb_chunks: OK');

  const hnsw = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'kb_chunks'
      AND indexname = 'kb_chunks_embedding_hnsw_idx'
  `);
  if (hnsw.rowCount === 0) {
    throw new Error('HNSW index kb_chunks_embedding_hnsw_idx не найден');
  }
  console.log('[smoke] HNSW index: OK');
  console.log('[smoke] PASS');
}

main()
  .catch((err: unknown) => {
    console.error('[kb:pg:smoke] FAIL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPools());
