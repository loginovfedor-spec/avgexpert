import type { RetrievalContext } from '../vector/ports/retriever';
import type { RetrievalTier } from '../vector/types';
import { resolveSemanticGraphEnabled } from '../semantic/semantic-graph.connection';
import { normalizeTier, resolveScopes } from './tier.policy';

export type DocumentContextInput = {
  retrievalTier?: string;
  extraParams?: Record<string, unknown>;
  userId: string;
  sessionId?: string;
};

export class DocumentContextResolver {
  resolve(input: DocumentContextInput): RetrievalContext {
    const tier = normalizeTier(input.retrievalTier) as RetrievalTier;
    const scopes = resolveScopes(tier, input.extraParams || {});

    return {
      userId: input.userId,
      sessionId: input.sessionId,
      tier,
      scopes,
      globalKbEnabled: scopes.includes('global'),
      semanticGraphEnabled: resolveSemanticGraphEnabled(tier, input.extraParams || {}),
    };
  }
}

export const documentContextResolver = new DocumentContextResolver();

