export interface Provenance {
  title?: string;
  uri?: string;
  [key: string]: unknown;
}

export interface IRetrievalChunk {
  id: string;
  sourceId: string;
  text: string;
  score: number;
  provenance: Provenance;
  boundaryNotes?: string;
}

export type RetrievalMode = 'no_retrieval' | 'fast' | 'balanced' | 'max_quality';

export interface RetrievalMetadata {
  latencyMs: number;
  routerMs: number;
  retrieverMs: number;
  validationMs: number;
  retrieverId: string;
  policyAction: string;
  shouldRefuse: boolean;
  error: string | null;
  cacheHit?: boolean;
}

export interface IRetrievalResult {
  query: string;
  mode: RetrievalMode;
  chunks: IRetrievalChunk[];
  metadata: RetrievalMetadata;
}
