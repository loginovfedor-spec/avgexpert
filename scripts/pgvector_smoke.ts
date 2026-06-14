/**
 * S1-6: smoke-check PostgreSQL + pgvector для VectorKB.
 *
 * Запуск:
 *   DATABASE_URL=postgresql://... npm run kb:pg:smoke
 *   npm run kb:pg:smoke -- --host=83.166.253.250
 */
import path from 'path';
import dotenv from 'dotenv';
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
  const versionText = String(ping.rows[0].version);
  console.log(`[smoke] PostgreSQL: ${versionText}`);

  const majorMatch = versionText.match(/PostgreSQL (\d+)/);
  const pgMajor = majorMatch ? parseInt(majorMatch[1], 10) : 0;
  if (pgMajor >= 18) {
    console.log(`[smoke] PostgreSQL major: ${pgMajor}`);
  } else if (pgMajor > 0) {
    console.warn(`[smoke] warning: PostgreSQL ${pgMajor} (ожидается 18+ на prod pilot)`);
  }

  const locale = await pool.query(`
    SELECT datcollate, datctype
    FROM pg_database
    WHERE datname = current_database()
  `);
  const lcCollate = String(locale.rows[0].datcollate);
  console.log(`[smoke] datcollate: ${lcCollate} (datctype: ${locale.rows[0].datctype})`);
  if (pgMajor >= 18 && lcCollate !== 'ru_RU.UTF-8') {
    throw new Error(`lc_collate=${lcCollate}, ожидался ru_RU.UTF-8 (ADR-1)`);
  }

  const applied = await runVectorMigrations({ connectionString });
  console.log(`[smoke] migrations: ${applied.length ? applied.join(', ') : 'already applied'}`);

  const ext = await getPgVectorExtensionVersion(connectionString);
  if (!ext.installed || !ext.version) {
    throw new Error('pgvector extension не установлен');
  }
  console.log(`[smoke] pgvector version: ${ext.version}`);

  if (!isPgVectorAtLeast(ext.version, 5)) {
    throw new Error(`pgvector ${ext.version} < 0.5 — HNSW недоступен`);
  }
  console.log('[smoke] pgvector >= 0.5: OK');

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

  const ftsIndex = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'kb_chunks'
      AND indexname = 'kb_chunks_body_tsv_gin_idx'
  `);
  if (ftsIndex.rowCount === 0) {
    throw new Error('GIN index kb_chunks_body_tsv_gin_idx не найден (D4 tsvector)');
  }
  console.log('[smoke] tsvector GIN index: OK');

  const ftsCol = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'kb_chunks' AND column_name = 'body_tsv'
  `);
  if (ftsCol.rowCount === 0) {
    throw new Error('колонка kb_chunks.body_tsv не найдена');
  }

  const ftsQuery = await pool.query(`
    SELECT COUNT(*)::int AS hits
    FROM kb_chunks
    WHERE body_tsv @@ plainto_tsquery('russian', 'налог')
    LIMIT 1
  `);
  console.log(`[smoke] Cyrillic tsquery smoke (налог): ${ftsQuery.rows[0].hits} hits`);
  console.log('[smoke] PASS');
}

main()
  .catch((err: unknown) => {
    console.error('[kb:pg:smoke] FAIL:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPools());
