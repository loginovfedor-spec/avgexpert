import type { IRetrievalChunk } from '../../../types/knowledge.types';
import type { RetrievalTier, VectorScope } from '../types';

export interface RetrievalContext {
  userId: string;
  sessionId?: string;
  tier: RetrievalTier;
  scopes: VectorScope[];
  globalKbEnabled: boolean;
}

export interface Retriever {
  retrieve(query: string, ctx: RetrievalContext): Promise<IRetrievalChunk[]>;
}
