import type { EmbeddingProvider } from '../ports/embedding.provider';
import type { RerankerProvider } from '../ports/reranker.provider';
import type { VectorStore } from '../ports/vector.store';
import type { Retriever, RetrievalContext } from '../ports/retriever';
import type { IRetrievalChunk } from '../../../types/knowledge.types';
import type { VectorFilter, VectorHit, VectorScope } from '../types';
import type { SemanticGraphService } from '../../semantic/semantic-graph.service';
import { getTopK } from '../../rag/tier.policy';
import { applyMetadataScoring, candidateTopK } from '../../rag/metadata-scoring';
import { applyDomainTagsFilter } from '../../rag/domain-tags-filter';
import { applyCrossEncoderRerank } from '../../rag/rerank-scoring';
import { shouldRerankTier } from '../reranker.service';

export interface TieredRetrieveResult {
  chunks: IRetrievalChunk[];
  embedMs: number;
  searchMs: number;
  rerankMs?: number;
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
    private readonly namespace: string,
    private readonly reranker: RerankerProvider | null = null,
    private readonly semanticGraph: SemanticGraphService | null = null
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
    const searchTopK = candidateTopK(ctx.tier, topK);
    const searchStart = Date.now();
    const allHits: VectorHit[] = [];

    for (const scope of scopes) {
      const hits = await this.store.search({
        embedding,
        namespace: this.namespace,
        topK: searchTopK,
        minScore: 0,
        filter: scopeFilter(scope, ctx),
      });
      allHits.push(...hits);
    }

    const searchMs = Date.now() - searchStart;
    let ranked = applyMetadataScoring(allHits, query, ctx.tier);
    ranked = applyDomainTagsFilter(ranked, query, ctx.tier);

    if (this.semanticGraph && ctx.semanticGraphEnabled && ctx.tier === 'sage') {
      ranked = await this.semanticGraph.expand(ranked, 1, ctx);
      ranked = applyDomainTagsFilter(ranked, query, ctx.tier);
    }

    let rerankMs = 0;

    if (this.reranker && shouldRerankTier(ctx.tier)) {
      const rerankStart = Date.now();
      ranked = await applyCrossEncoderRerank(ranked, query, this.reranker);
      rerankMs = Date.now() - rerankStart;
    }

    const chunks = ranked
      .slice(0, topK)
      .map(hitToChunk);

    return { chunks, embedMs, searchMs, rerankMs };
  }
}

module.exports = { TieredRetriever };
