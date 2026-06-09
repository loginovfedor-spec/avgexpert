import type { VectorScope } from '../vector/types';

export interface SectionContext {
  partTitle?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  sectionIndex?: number;
  sectionTitle?: string;
  subsectionTitle?: string;
  sectionPath?: string;
}

export interface RawChunk {
  text: string;
  enrichedText: string;
  chunkIndex: number;
  sectionPath?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  sectionIndex?: number;
  sectionTitle?: string;
  tokenCount?: number;
}

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  bookTitle?: string;
}

export interface IngestFileInput {
  filePath: string;
  scope?: VectorScope;
  title?: string;
  mime?: string;
  sourceUri?: string;
  ownerUserId?: string;
  sessionId?: string;
  docType?: string;
  bookId?: string;
  bookTitle?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  replaceExisting?: boolean;
}

export interface IngestResult {
  docId: string;
  status: 'ready' | 'failed';
  chunkCount: number;
  filename: string;
  checksum: string;
  error?: string;
}
