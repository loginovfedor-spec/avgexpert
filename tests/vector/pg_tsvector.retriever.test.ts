import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runVectorMigrations } from '../../src/modules/vector/pg/migrate';
import { closePgPools, getPgPool } from '../../src/modules/vector/pg/pool';
import { isAppPgEnabled } from '../../src/core/pg/database.port';
import { loadEmbeddingConfig } from '../../src/modules/vector/embedding.service';

test('D4: pg tsvector retriever finds Cyrillic chunks (requires DATABASE_URL)', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set');
    return;
  }

  await runVectorMigrations();
  const namespace = loadEmbeddingConfig().namespace;
  const pool = getPgPool();
  const docId = randomUUID();
  const chunkId = randomUUID();

  await pool.query(
    `
    INSERT INTO kb_documents (id, scope, filename, status)
    VALUES ($1, 'global', 'fts-smoke.md', 'ready')
    `,
    [docId]
  );

  const dims = loadEmbeddingConfig().dimensions;
  const zeroVec = `[${Array(dims).fill(0).join(',')}]`;
  await pool.query(
    `
    INSERT INTO kb_chunks (
      id, namespace, scope, doc_id, body, title, embedding, metadata
    ) VALUES (
      $1, $2, 'global', $3,
      $4, $5, $6::vector, '{}'::jsonb
    )
    `,
    [
      chunkId,
      namespace,
      docId,
      'Это тестовый документ для проверки полнотекстового поиска на кириллице.',
      'fts-smoke',
      zeroVec,
    ]
  );

  const { PgTsvectorRetriever } = await import('../../src/modules/vector/retrievers/pg_tsvector.retriever');
  const retriever = new PgTsvectorRetriever();
  const results = await retriever.search('проверки полнотекстового', { namespace, limit: 5 });

  assert.ok(results.length > 0);
  assert.match(results[0].text, /тестовый документ/);

  await pool.query('DELETE FROM kb_chunks WHERE id = $1', [chunkId]);
  await pool.query('DELETE FROM kb_documents WHERE id = $1', [docId]);
});

test.after(async () => {
  await closePgPools();
});
