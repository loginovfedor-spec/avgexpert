import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUN_INTEGRATION = process.env.SKIP_PG_INTEGRATION !== 'true';

test('semantic graph migration SQL defines nodes and edges tables', () => {
  const sqlPath = path.join(
    __dirname,
    '../../src/modules/vector/pg/migrations/002_semantic_graph.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  assert.match(sql, /kb_semantic_nodes/);
  assert.match(sql, /kb_semantic_edges/);
  assert.match(sql, /node_type/);
  assert.match(sql, /edge_type/);
});

test('runVectorMigrations applies 002_semantic_graph', { skip: !RUN_INTEGRATION }, async () => {
  const { runVectorMigrations } = await import('../../src/modules/vector/pg/migrate');
  const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
  const { getPgPool, closePgPools } = await import('../../src/modules/vector/pg/pool');

  const pgUrl = resolvePgConnectionString();
  if (!pgUrl) return;

  await runVectorMigrations({ connectionString: pgUrl, dims: 64 });
  const pool = getPgPool(pgUrl);
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('kb_semantic_nodes', 'kb_semantic_edges')
    ORDER BY table_name
  `);

  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    'kb_semantic_edges',
    'kb_semantic_nodes',
  ]);

  await closePgPools();
});
