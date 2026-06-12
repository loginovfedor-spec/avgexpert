import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ChunkingService } from '../src/modules/ingestion/chunking.service';
import { entityExtractionService } from '../src/modules/semantic/entity-extraction.service';
import { SemanticGraphRepository } from '../src/modules/semantic/semantic-graph.repository';
import type { EntityExtractionQualityReport } from '../src/modules/semantic/types';
import { closePgPools } from '../src/modules/vector/pg/pool';
import { runVectorMigrations } from '../src/modules/vector/pg/migrate';
import { resolvePgConnectionString } from '../src/modules/vector/pg/connection';
import { loadEmbeddingConfig } from '../src/modules/vector/embedding.service';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TARGET_DOCS = 10;

type BookEntry = {
  title: string;
  subtitle?: string;
  file: string;
  order: number;
};

type BooksManifest = {
  books: BookEntry[];
};

async function main(): Promise<void> {
  const pgUrl = resolvePgConnectionString();
  if (!pgUrl) {
    throw new Error('DATABASE_URL не задан — spike требует PG');
  }

  const embeddingConfig = loadEmbeddingConfig();
  await runVectorMigrations({ connectionString: pgUrl, dims: embeddingConfig.dimensions });

  const booksDir = path.join(__dirname, '..', 'webui_src', 'assets', 'books');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(booksDir, 'books.json'), 'utf-8')
  ) as BooksManifest;

  const chunking = new ChunkingService();
  const repository = new SemanticGraphRepository(
    (await import('../src/modules/vector/pg/pool')).getPgPool(pgUrl)
  );

  const selectedBooks = manifest.books
    .sort((a, b) => a.order - b.order)
    .slice(0, TARGET_DOCS);

  let chunkCount = 0;
  let totalEntities = 0;
  const uniqueEntities = new Set<string>();
  let taggedChunks = 0;
  const samples: EntityExtractionQualityReport['samples'] = [];

  for (const book of selectedBooks) {
    const filePath = path.join(booksDir, book.file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const spikeDocKey = `spike:${book.file}`;
    const rawChunks = chunking.chunkText(content, {
      bookTitle: book.title,
      chunkSize: 1200,
      chunkOverlap: 150,
    }).slice(0, 4);

    for (const rawChunk of rawChunks) {
      const extraction = entityExtractionService.extract({
        body: rawChunk.enrichedText || rawChunk.text,
        bookTitle: book.title,
        chapterTitle: rawChunk.chapterTitle,
        sectionTitle: rawChunk.sectionTitle,
        sectionPath: rawChunk.sectionPath,
      });

      chunkCount += 1;
      totalEntities += extraction.entities.length;
      for (const entity of extraction.entities) uniqueEntities.add(entity.canonicalKey);
      if (extraction.domainTags.length > 0) taggedChunks += 1;

      const nodes = extraction.entities.map((entity) => ({
        nodeType: entity.nodeType,
        label: entity.label,
        canonicalKey: entity.canonicalKey,
        metadata: {
          spike_doc_key: spikeDocKey,
          chunk_index: rawChunk.chunkIndex,
        },
      }));

      const edges = extraction.entities
        .filter((entity) => entity.canonicalKey !== book.title.toLowerCase())
        .map((entity) => ({
          sourceCanonicalKey: entity.canonicalKey,
          targetCanonicalKey: book.title.toLowerCase().replace(/\s+/g, ' '),
          edgeType: 'mentions' as const,
          weight: 1,
        }));

      nodes.push({
        nodeType: 'domain',
        label: book.title,
        canonicalKey: book.title.toLowerCase().replace(/\s+/g, ' '),
        metadata: { spike_doc_key: spikeDocKey, chunk_index: 0 },
      });

      await repository.upsertGraph({
        namespace: embeddingConfig.namespace,
        nodes,
        edges,
      });

      if (samples.length < 5) {
        samples.push({
          docTitle: book.title,
          chunkIndex: rawChunk.chunkIndex,
          entities: extraction.entities.slice(0, 6).map((item) => item.label),
          domainTags: extraction.domainTags,
        });
      }
    }
  }

  const report: EntityExtractionQualityReport = {
    generatedAt: new Date().toISOString(),
    docCount: selectedBooks.length,
    chunkCount,
    totalEntities,
    uniqueEntities: uniqueEntities.size,
    avgEntitiesPerChunk: chunkCount > 0 ? Number((totalEntities / chunkCount).toFixed(2)) : 0,
    domainTagCoverage: chunkCount > 0 ? Number((taggedChunks / chunkCount).toFixed(3)) : 0,
    samples,
    notes: [
      `Processed ${selectedBooks.length}/${TARGET_DOCS} target docs from books manifest`,
      'Rule-based extractor: glossary + title-case terms + metadata sections',
      'Graph edges: entity -> book domain (mentions); 1-hop expansion tested separately',
    ],
  };

  const outDir = path.join(__dirname, '..', 'scratch');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'semantic_graph_spike_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`[spike:semantic-graph] report: ${outPath}`);
  console.log(JSON.stringify(report, null, 2));

  await closePgPools();
}

main().catch((err) => {
  console.error('[spike:semantic-graph] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
