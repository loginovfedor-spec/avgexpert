import type { IRetrievalChunk } from '../../../types/knowledge.types';
import type { RetrievalTier, VectorScope } from '../types';

export interface RetrievalContext {
  userId: string;
  sessionId?: string;
  tier: RetrievalTier;
  scopes: VectorScope[];
  globalKbEnabled: boolean;
  /** Sage opt-in: 1-hop graph expansion (S8-3). */
  semanticGraphEnabled?: boolean;
}

export interface Retriever {
  retrieve(query: string, ctx: RetrievalContext): Promise<IRetrievalChunk[]>;
}
