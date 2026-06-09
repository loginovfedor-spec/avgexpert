import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DIMS = parseInt(process.env.EMBEDDING_DIMS || '1024', 10);
const RUN_INTEGRATION = process.env.SKIP_PG_INTEGRATION !== 'true';

test('IngestionPipeline integration', { skip: !RUN_INTEGRATION }, async (t) => {
  process.env.EMBEDDING_MOCK = 'true';

  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');
  const { runVectorMigrations } = await import('../../src/modules/vector/pg/migrate');
  const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
  const { closePgPools } = await import('../../src/modules/vector/pg/pool');
  const { PgVectorStore } = await import('../../src/modules/vector/stores/pgvector.store');
  const { KbRepository } = await import('../../src/modules/kb/kb.repository');
  const { IngestionPipeline } = await import('../../src/modules/ingestion/pipeline');
  const { ChunkingService } = await import('../../src/modules/ingestion/chunking.service');
  const { loadEmbeddingConfig } = await import('../../src/modules/vector/embedding.service');

  const PG_URL = resolvePgConnectionString();
  if (!PG_URL) {
    t.skip('DATABASE_URL не найден');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-ingest-'));
  const allowedDir = path.join(tmpDir, 'allowed');
  fs.mkdirSync(allowedDir, { recursive: true });
  const prevAllowedDir = process.env.KB_INGEST_ALLOWED_DIR;
  process.env.KB_INGEST_ALLOWED_DIR = allowedDir;

  const sampleFile = path.join(allowedDir, 'sample.md');
  fs.writeFileSync(
    sampleFile,
    '# Глава 9. Тест\n\n## 9.1. Маркер\n\nУникальный маркер_ингест_пайплайн для поиска.\n',
    'utf-8'
  );

  const namespace = `ingest-test-${randomUUID()}`;
  const prevNamespace = process.env.EMBEDDING_NAMESPACE;
  process.env.EMBEDDING_NAMESPACE = namespace;

  const provider = new MockEmbeddingProvider({ dimensions: DIMS });
  const store = new PgVectorStore({ connectionString: PG_URL, dimensions: DIMS });
  const kbRepository = new KbRepository({ connectionString: PG_URL });
  const pipeline = new IngestionPipeline({
    embedding: provider,
    store,
    kbRepository,
  });

  t.after(async () => {
    await store.delete({ namespace });
    process.env.KB_INGEST_ALLOWED_DIR = prevAllowedDir;
    process.env.EMBEDDING_NAMESPACE = prevNamespace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await closePgPools();
  });

  await runVectorMigrations({ connectionString: PG_URL, dims: DIMS });

  await t.test('ingest file → ready + searchable', async () => {
    const result = await pipeline.ingestFile({
      filePath: 'sample.md',
      scope: 'global',
      title: 'Тестовый документ',
      docType: 'test',
    });

    assert.equal(result.status, 'ready');
    assert.ok(result.chunkCount >= 1);

    const doc = await kbRepository.findById(result.docId);
    assert.equal(doc?.status, 'ready');

    const embeddingConfig = loadEmbeddingConfig();
    assert.equal(embeddingConfig.namespace, namespace);

    const chunker = new ChunkingService();
    const rawChunks = chunker.chunkFileContent(fs.readFileSync(sampleFile, 'utf-8'), {
      bookTitle: 'Тестовый документ',
    });
    const target = rawChunks.find(chunk => chunk.text.includes('маркер_ингест_пайплайн'));
    assert.ok(target);

    const hits = await store.search({
      embedding: (await provider.embed([target!.enrichedText]))[0],
      namespace,
      topK: 3,
      minScore: 0,
      filter: { scope: 'global' },
    });

    assert.ok(hits.length >= 1);
    assert.ok(hits[0].body.includes('маркер_ингест_пайплайн'));
  });
});
