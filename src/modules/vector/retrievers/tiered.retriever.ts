import type { EmbeddingProvider } from '../ports/embedding.provider';
import type { VectorStore } from '../ports/vector.store';
import type { Retriever, RetrievalContext } from '../ports/retriever';
import type { IRetrievalChunk } from '../../../types/knowledge.types';
import type { VectorFilter, VectorHit, VectorScope } from '../types';
import { getTopK } from '../../rag/tier.policy';

export interface TieredRetrieveResult {
  chunks: IRetrievalChunk[];
  embedMs: number;
  searchMs: number;
}

function hitToChunk(hit: VectorHit): IRetrievalChunk {
  const meta = hit.metadata || {};
  const title = hit.title || (meta.book_title as string) || (meta.title as string) || 'Untitled';
  const uri = (meta.source_uri as string) || (meta.section_path as string) || hit.docId || hit.id;

  return {
    id: hit.id,
    sourceId: hit.docId || hit.id,
    text: hit.body,
    score: hit.score,
    provenance: {
      title,
      uri,
      scope: hit.scope,
      namespace: hit.namespace,
      ...meta,
    },
  };
}

function scopeFilter(scope: VectorScope, ctx: RetrievalContext): VectorFilter {
  const filter: VectorFilter = { scope };
  if (scope === 'user') {
    filter.ownerUserId = ctx.userId;
  }
  if (scope === 'session') {
    filter.ownerUserId = ctx.userId;
    if (ctx.sessionId) filter.sessionId = ctx.sessionId;
  }
  return filter;
}

function activeScopes(ctx: RetrievalContext): VectorScope[] {
  return ctx.scopes.filter((scope) => {
    if (scope === 'global') return ctx.globalKbEnabled;
    if (scope === 'session') return Boolean(ctx.sessionId);
    return true;
  });
}

export class TieredRetriever implements Retriever {
  constructor(
    private readonly embedding: EmbeddingProvider,
    private readonly store: VectorStore,
    private readonly namespace: string
  ) {}

  async retrieve(query: string, ctx: RetrievalContext): Promise<IRetrievalChunk[]> {
    const result = await this.retrieveWithTiming(query, ctx);
    return result.chunks;
  }

  async retrieveWithTiming(query: string, ctx: RetrievalContext): Promise<TieredRetrieveResult> {
    const scopes = activeScopes(ctx);
    if (scopes.length === 0) {
      return { chunks: [], embedMs: 0, searchMs: 0 };
    }

    const embedStart = Date.now();
    const embedding = await this.embedding.embedQuery(query);
    const embedMs = Date.now() - embedStart;

    const topK = getTopK(ctx.tier);
    const searchStart = Date.now();
    const allHits: VectorHit[] = [];

    for (const scope of scopes) {
      const hits = await this.store.search({
        embedding,
        namespace: this.namespace,
        topK,
        minScore: 0,
        filter: scopeFilter(scope, ctx),
      });
      allHits.push(...hits);
    }

    const searchMs = Date.now() - searchStart;
    const chunks = allHits
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(hitToChunk);

    return { chunks, embedMs, searchMs };
  }
}

module.exports = { TieredRetriever };
