import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v5 as uuidv5 } from 'uuid';
import type { EmbeddingProvider } from '../vector/ports/embedding.provider';
import type { VectorStore } from '../vector/ports/vector.store';
import type { VectorChunk, VectorScope } from '../vector/types';
import { createEmbeddingProviderFromEnv, loadEmbeddingConfig } from '../vector/embedding.service';
import { createVectorStoreFromEnv } from '../vector/registry';
import { KbRepository } from '../kb/kb.repository';
import { ChunkingService } from './chunking.service';
import { assertSafeSourceUri, resolveIngestFilePath } from './path-utils';
import type { IngestContentInput, IngestFileInput, IngestResult } from './types';

const CHUNK_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const EMBED_BATCH_SIZE = 16;

export interface IngestionPipelineDeps {
  embedding?: EmbeddingProvider;
  store?: VectorStore;
  kbRepository?: KbRepository;
  chunking?: ChunkingService;
}

function inferMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  return 'text/plain';
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function chunkIdFor(docId: string, chunkIndex: number): string {
  return uuidv5(`${docId}:${chunkIndex}`, CHUNK_ID_NAMESPACE);
}

export class IngestionPipeline {
  private readonly embedding: EmbeddingProvider;
  private readonly store: VectorStore;
  private readonly kbRepository: KbRepository;
  private readonly chunking: ChunkingService;
  private readonly namespace: string;

  constructor(deps: IngestionPipelineDeps = {}) {
    const embeddingConfig = loadEmbeddingConfig();
    this.namespace = embeddingConfig.namespace;
    this.embedding = deps.embedding || createEmbeddingProviderFromEnv();
    this.store = deps.store || createVectorStoreFromEnv();
    this.kbRepository = deps.kbRepository || new KbRepository();
    this.chunking = deps.chunking || new ChunkingService();
  }

  async ingestFile(input: IngestFileInput): Promise<IngestResult> {
    assertSafeSourceUri(input.sourceUri);
    const resolvedPath = resolveIngestFilePath(input.filePath);
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const filename = path.basename(resolvedPath);
    return this.ingestContent({
      content,
      filename,
      scope: input.scope,
      title: input.title,
      mime: input.mime || inferMime(resolvedPath),
      sourceUri: input.sourceUri || resolvedPath,
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      docType: input.docType,
      chunkSize: input.chunkSize,
      chunkOverlap: input.chunkOverlap,
      replaceExisting: input.replaceExisting,
      bookTitle: input.bookTitle,
      bookId: input.bookId,
    });
  }

  async ingestContent(input: IngestContentInput & {
    bookTitle?: string;
    bookId?: string;
  }): Promise<IngestResult> {
    assertSafeSourceUri(input.sourceUri);
    const content = input.content;
    const checksum = sha256(content);
    const filename = input.filename;
    const scope: VectorScope = input.scope || 'global';
    const docId = crypto.randomUUID();
    const title = input.title || filename;

    await this.kbRepository.createDocument({
      id: docId,
      scope,
      filename,
      mime: input.mime || inferMime(filename),
      size: Buffer.byteLength(content, 'utf-8'),
      sourceUri: input.sourceUri || `upload://${filename}`,
      ownerUserId: input.ownerUserId,
      sessionId: input.sessionId,
      status: 'pending',
    });

    try {
      await this.kbRepository.updateStatus(docId, 'processing');

      if (input.replaceExisting !== false) {
        await this.store.delete({ docId });
      }

      const rawChunks = this.chunking.chunkFileContent(content, {
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        bookTitle: input.bookTitle || title,
      });

      if (rawChunks.length === 0) {
        await this.kbRepository.updateStatus(docId, 'ready');
        return { docId, status: 'ready', chunkCount: 0, filename, checksum };
      }

      const vectorChunks: VectorChunk[] = [];
      for (let offset = 0; offset < rawChunks.length; offset += EMBED_BATCH_SIZE) {
        const batch = rawChunks.slice(offset, offset + EMBED_BATCH_SIZE);
        const embeddings = await this.embedding.embed(batch.map(item => item.enrichedText));

        for (let i = 0; i < batch.length; i++) {
          const raw = batch[i];
          vectorChunks.push({
            id: chunkIdFor(docId, raw.chunkIndex),
            namespace: this.namespace,
            scope,
            ownerUserId: input.ownerUserId,
            sessionId: input.sessionId,
            docId,
            body: raw.enrichedText,
            title: raw.sectionTitle || title,
            sectionPath: raw.sectionPath,
            docType: input.docType,
            bookId: input.bookId,
            bookTitle: input.bookTitle || title,
            chapterIndex: raw.chapterIndex,
            chapterTitle: raw.chapterTitle,
            sectionIndex: raw.sectionIndex,
            sectionTitle: raw.sectionTitle,
            chunkIndex: raw.chunkIndex,
            tokenCount: raw.tokenCount,
            embedding: embeddings[i],
            checksum: sha256(raw.text),
            metadata: {
              sourceUri: input.sourceUri,
              docChecksum: checksum,
            },
          });
        }
      }

      await this.store.upsert(vectorChunks);
      await this.kbRepository.updateStatus(docId, 'ready');

      return {
        docId,
        status: 'ready',
        chunkCount: vectorChunks.length,
        filename,
        checksum,
      };
    } catch (err) {
      await this.kbRepository.updateStatus(docId, 'failed');
      const message = err instanceof Error ? err.message : String(err);
      return {
        docId,
        status: 'failed',
        chunkCount: 0,
        filename,
        checksum,
        error: message,
      };
    }
  }

  async indexExistingDocument(
    input: IngestContentInput & {
      docId: string;
      bookTitle?: string;
      bookId?: string;
    }
  ): Promise<IngestResult> {
    assertSafeSourceUri(input.sourceUri);
    const content = input.content;
    const checksum = sha256(content);
    const filename = input.filename;
    const scope: VectorScope = input.scope || 'global';
    const docId = input.docId;
    const title = input.title || filename;

    const existing = await this.kbRepository.findById(docId);
    if (!existing) {
      return {
        docId,
        status: 'failed',
        chunkCount: 0,
        filename,
        checksum,
        error: 'Document record not found',
      };
    }

    try {
      await this.kbRepository.updateStatus(docId, 'processing');

      if (input.replaceExisting !== false) {
        await this.store.delete({ docId });
      }

      const rawChunks = this.chunking.chunkFileContent(content, {
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        bookTitle: input.bookTitle || title,
      });

      if (rawChunks.length === 0) {
        await this.kbRepository.updateStatus(docId, 'ready');
        return { docId, status: 'ready', chunkCount: 0, filename, checksum };
      }

      const vectorChunks: VectorChunk[] = [];
      for (let offset = 0; offset < rawChunks.length; offset += EMBED_BATCH_SIZE) {
        const batch = rawChunks.slice(offset, offset + EMBED_BATCH_SIZE);
        const embeddings = await this.embedding.embed(batch.map(item => item.enrichedText));

        for (let i = 0; i < batch.length; i++) {
          const raw = batch[i];
          vectorChunks.push({
            id: chunkIdFor(docId, raw.chunkIndex),
            namespace: this.namespace,
            scope,
            ownerUserId: input.ownerUserId,
            sessionId: input.sessionId,
            docId,
            body: raw.enrichedText,
            title: raw.sectionTitle || title,
            sectionPath: raw.sectionPath,
            docType: input.docType,
            bookId: input.bookId,
            bookTitle: input.bookTitle || title,
            chapterIndex: raw.chapterIndex,
            chapterTitle: raw.chapterTitle,
            sectionIndex: raw.sectionIndex,
            sectionTitle: raw.sectionTitle,
            chunkIndex: raw.chunkIndex,
            tokenCount: raw.tokenCount,
            embedding: embeddings[i],
            checksum: sha256(raw.text),
            metadata: {
              sourceUri: input.sourceUri,
              docChecksum: checksum,
            },
          });
        }
      }

      await this.store.upsert(vectorChunks);
      await this.kbRepository.updateStatus(docId, 'ready');

      return {
        docId,
        status: 'ready',
        chunkCount: vectorChunks.length,
        filename,
        checksum,
      };
    } catch (err) {
      await this.kbRepository.updateStatus(docId, 'failed');
      const message = err instanceof Error ? err.message : String(err);
      return {
        docId,
        status: 'failed',
        chunkCount: 0,
        filename,
        checksum,
        error: message,
      };
    }
  }
}

export function createIngestionPipeline(deps?: IngestionPipelineDeps): IngestionPipeline {
  return new IngestionPipeline(deps);
}

