export type VectorScope = 'global' | 'user' | 'session';

export type RetrievalTier = 'consultant' | 'expert' | 'sage';

export interface VectorChunk {
  id: string;
  namespace: string;
  scope: VectorScope;
  ownerUserId?: string;
  sessionId?: string;
  docId?: string;
  body: string;
  title?: string;
  sectionPath?: string;
  pageFrom?: number;
  pageTo?: number;
  docType?: string;
  bookId?: string;
  bookTitle?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  sectionIndex?: number;
  sectionTitle?: string;
  domainTags?: string[];
  entityIds?: string[];
  chunkIndex?: number;
  tokenCount?: number;
  embedding: number[];
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface VectorHit {
  id: string;
  namespace: string;
  scope: VectorScope;
  ownerUserId?: string;
  sessionId?: string;
  docId?: string;
  body: string;
  title?: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorFilter {
  namespace?: string;
  scope?: VectorScope | VectorScope[];
  ownerUserId?: string;
  sessionId?: string;
  docId?: string;
}

export interface VectorSearchParams {
  embedding: number[];
  namespace: string;
  topK?: number;
  minScore?: number;
  filter?: VectorFilter;
}

export interface KbDocumentRecord {
  id: string;
  scope: VectorScope;
  ownerUserId?: string;
  sessionId?: string;
  filename: string;
  mime?: string;
  size?: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  sourceUri?: string;
}

export interface EmbeddingConfig {
  provider: string;
  model: string;
  dimensions: number;
  namespace: string;
  apiUrl?: string;
  mock: boolean;
}

export interface VectorStoreConfig {
  id: string;
  connectionString: string;
  dimensions: number;
}
