import { IRetrievalChunk, IRetrievalResult, RetrievalMode, RetrievalMetadata, Provenance } from '../../types/knowledge.types';
import logger from '../../core/logger';
const knowledgeTypesLogger = logger.scoped('KnowledgeTypes');

type RetrievalChunkInput = Partial<IRetrievalChunk> & {
  id?: string;
  sourceId?: string;
  text?: string;
  score?: number;
  provenance?: Provenance;
};

type RetrievalResultInput = {
  query: string;
  mode?: RetrievalMode;
  chunks?: RetrievalChunkInput[];
  metadata?: Partial<RetrievalMetadata>;
};

export class RetrievalChunk implements IRetrievalChunk {
  id: string;
  sourceId: string;
  text: string;
  score: number;
  provenance: Provenance;
  boundaryNotes?: string;

  constructor({ id, sourceId, text, score, provenance, boundaryNotes }: RetrievalChunkInput) {
    this.id = id || '';
    this.sourceId = sourceId || '';
    this.text = text || '';
    this.score = score || 0;
    this.provenance = provenance || {};
    this.boundaryNotes = boundaryNotes || '';
  }

  validate() {
    if (!this.id) throw new Error('RetrievalChunk: Missing id');
    if (!this.sourceId) throw new Error('RetrievalChunk: Missing sourceId');
    if (!this.text) throw new Error('RetrievalChunk: Missing text');
    if (this.score < 0 || this.score > 1) {
      knowledgeTypesLogger.warn('Retrieval score out of range. Normalizing', { score: this.score });
      this.score = Math.max(0, Math.min(1, this.score));
    }
  }
}

export class RetrievalResult implements IRetrievalResult {
  query: string;
  mode: RetrievalMode;
  chunks: RetrievalChunk[];
  metadata: RetrievalMetadata;

  constructor({ query, mode, chunks = [], metadata = {} }: RetrievalResultInput) {
    this.query = query;
    this.mode = mode || 'balanced';
    this.chunks = chunks.map((c) => new RetrievalChunk(c));
    this.metadata = {
      latencyMs: metadata.latencyMs || 0,
      routerMs: metadata.routerMs || 0,
      retrieverMs: metadata.retrieverMs || 0,
      validationMs: metadata.validationMs || 0,
      retrieverId: metadata.retrieverId || 'unknown',
      policyAction: metadata.policyAction || 'none',
      shouldRefuse: metadata.shouldRefuse || false,
      error: metadata.error || null,
      cacheHit: metadata.cacheHit || false,
      embedMs: metadata.embedMs || 0,
      searchMs: metadata.searchMs || 0,
      rerankMs: metadata.rerankMs || 0,
    };
  }

  validate() {
    if (!this.query) throw new Error('RetrievalResult: Missing query');
    this.chunks.forEach(c => c.validate());
  }
}
