import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v5 as uuidv5 } from 'uuid';
import { closePgPools } from '../src/modules/vector/pg/pool';
import { runVectorMigrations } from '../src/modules/vector/pg/migrate';
import { createIngestionPipeline } from '../src/modules/ingestion/pipeline';
import { createVectorStackFromEnv } from '../src/modules/vector/registry';
import { KbRepository } from '../src/modules/kb/kb.repository';
import { resolvePgConnectionString } from '../src/modules/vector/pg/connection';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BOOK_ID_NAMESPACE = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

type BookEntry = {
  title: string;
  subtitle?: string;
  file: string;
  order: number;
};

type BooksManifest = {
  books: BookEntry[];
};

type BookReport = {
  file: string;
  bookTitle: string;
  docId: string;
  chunkCount: number;
  metadataCompleteness: {
    withSectionPath: number;
    withBookTitle: number;
    withChapterTitle: number;
    ratio: number;
  };
  status: string;
  error?: string;
};

async function recallSmoke(
  namespace: string,
  queries: string[]
): Promise<Array<{ query: string; hitCount: number; topScore: number | null }>> {
  const { embedding, store } = createVectorStackFromEnv();
  const results = [];
  for (const query of queries) {
    const vector = await embedding.embedQuery(query);
    const hits = await store.search({
      embedding: vector,
      namespace,
      topK: 3,
      minScore: 0,
      filter: { scope: 'global' },
    });
    results.push({
      query,
      hitCount: hits.length,
      topScore: hits[0]?.score ?? null,
    });
  }
  return results;
}

function loadQueries(limit = 5): string[] {
  const queriesPath = path.join(__dirname, '..', 'tests', 'evals', 'rag_recall_queries.json');
  if (!fs.existsSync(queriesPath)) return [];
  const payload = JSON.parse(fs.readFileSync(queriesPath, 'utf-8')) as { queries?: Array<{ query: string }> };
  return (payload.queries || []).slice(0, limit).map(item => item.query);
}

async function main(): Promise<void> {
  const booksDir = path.join(__dirname, '..', 'webui_src', 'assets', 'books');
  const manifestPath = path.join(booksDir, 'books.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BooksManifest;
  const pipeline = createIngestionPipeline();
  const kbRepository = new KbRepository();
  const embeddingConfig = (await import('../src/modules/vector/embedding.service')).loadEmbeddingConfig();

  await runVectorMigrations();

  const books: BookReport[] = [];
  let totalChunks = 0;

  for (const book of manifest.books.sort((a, b) => a.order - b.order)) {
    const bookTitle = book.subtitle ? `${book.title}: ${book.subtitle}` : book.title;
    const bookId = uuidv5(book.file, BOOK_ID_NAMESPACE);
    console.log(`[kb:reindex-books] ingest ${book.file} ...`);
    const result = await pipeline.ingestFile({
      filePath: book.file,
      scope: 'global',
      title: bookTitle,
      bookTitle,
      bookId,
      docType: 'canonical_book',
      replaceExisting: true,
    });

    const chunkCount = result.status === 'ready'
      ? await kbRepository.countChunksByDocId(result.docId)
      : 0;
    totalChunks += chunkCount;

    let withSectionPath = 0;
    let withBookTitle = 0;
    let withChapterTitle = 0;

    if (chunkCount > 0 && resolvePgConnectionString()) {
      const stats = await kbRepository.getChunkMetadataStats(result.docId);
      withSectionPath = stats.withSectionPath;
      withBookTitle = stats.withBookTitle;
      withChapterTitle = stats.withChapterTitle;
    }

    const ratio = chunkCount > 0 ? withSectionPath / chunkCount : 0;
    books.push({
      file: book.file,
      bookTitle,
      docId: result.docId,
      chunkCount,
      metadataCompleteness: {
        withSectionPath,
        withBookTitle,
        withChapterTitle,
        ratio: Number(ratio.toFixed(4)),
      },
      status: result.status,
      error: result.error,
    });
  }

  const recallQueries = loadQueries();
  let recallSmokeResults: Array<{ query: string; hitCount: number; topScore: number | null }> = [];
  if (recallQueries.length > 0 && totalChunks > 0) {
    try {
      recallSmokeResults = await recallSmoke(embeddingConfig.namespace, recallQueries);
    } catch (err) {
      recallSmokeResults = [{
        query: '__recall_smoke_error__',
        hitCount: 0,
        topScore: null,
      }];
      console.warn('[kb:reindex-books] recall smoke failed:', err instanceof Error ? err.message : err);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    namespace: embeddingConfig.namespace,
    totalBooks: books.length,
    totalChunks,
    books,
    recallSmoke: recallSmokeResults,
  };

  const outDir = path.join(__dirname, '..', 'scratch');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'kb_reindex_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[kb:reindex-books] report: ${outPath}`);
  console.log(JSON.stringify(report, null, 2));

  const failed = books.some(book => book.status !== 'ready');
  if (failed) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('[kb:reindex-books] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPools());
