import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const DIMS = parseInt(process.env.EMBEDDING_DIMS || '1024', 10);
const RUN_INTEGRATION = process.env.SKIP_PG_INTEGRATION !== 'true';

test('PgVectorStore integration', { skip: !RUN_INTEGRATION }, async (t) => {
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { runVectorMigrations } = await import('../../src/modules/vector/pg/migrate');
  const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
  const { closePgPools } = await import('../../src/modules/vector/pg/pool');
  const { PgVectorStore } = await import('../../src/modules/vector/stores/pgvector.store');

  const PG_URL = resolvePgConnectionString();
  if (!PG_URL) {
    t.skip('DATABASE_URL не найден в env или providers/config');
    return;
  }

  const namespace = `test-${randomUUID()}`;
  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const store = new PgVectorStore({ connectionString: PG_URL!, dimensions: DIMS });

  await t.test('setup: migrations', async () => {
    const applied = await runVectorMigrations({ connectionString: PG_URL!, dims: DIMS });
    assert.ok(Array.isArray(applied));
  });

  await t.test('upsert/search/delete lifecycle', async () => {
    const id = randomUUID();
    const embedding = (await provider.embed(['маркер_векторного_поиска']))[0];

    await store.upsert([{
      id,
      namespace,
      scope: 'global',
      body: 'Текст про маркер_векторного_поиска в базе знаний',
      title: 'test-doc',
      embedding,
      metadata: { source: 'integration-test' },
    }]);

    const hits = await store.search({
      embedding: (await provider.embed(['маркер_векторного_поиска']))[0],
      namespace,
      topK: 3,
      minScore: 0,
    });

    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, id);
    assert.ok(hits[0].score > 0.9);

    const deleted = await store.delete({ namespace });
    assert.ok(deleted >= 1);
  });

  await t.test('health', async () => {
    assert.equal(await store.health(), true);
  });

  await closePgPools();
});
