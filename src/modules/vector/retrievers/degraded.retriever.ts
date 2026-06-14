import type { Retriever, RetrievalContext } from '../ports/retriever';
import type { IRetrievalChunk } from '../../../types/knowledge.types';
import { TieredRetriever, TieredRetrieveResult } from './tiered.retriever';
import { getVectorHealthSection, VectorHealthSection } from '../vector.health';
import { getTopK } from '../../rag/tier.policy';
import { FTS_FALLBACK_ENABLED } from '../../../core/config';

function isFtsFallbackEnabled(): boolean {
  if (process.env.FTS_FALLBACK_ENABLED !== undefined) {
    return process.env.FTS_FALLBACK_ENABLED === 'true';
  }
  return Boolean(FTS_FALLBACK_ENABLED);
}

type FtsRetriever = {
  search(query: string, config?: { limit?: number; minScore?: number }): Promise<IRetrievalChunk[]>;
};

type HealthCheck = () => Promise<VectorHealthSection>;

let cachedHealth: { at: number; value: VectorHealthSection } | null = null;
const HEALTH_TTL_MS = 30_000;

async function getCachedVectorHealth(): Promise<VectorHealthSection> {
  const now = Date.now();
  if (cachedHealth && now - cachedHealth.at < HEALTH_TTL_MS) {
    return cachedHealth.value;
  }
  const value = await getVectorHealthSection();
  cachedHealth = { at: now, value };
  return value;
}

export interface DegradedRetrieveResult extends TieredRetrieveResult {
  retrieverId: string;
  degraded: boolean;
}

export class DegradedRetriever implements Retriever {
  constructor(
    private readonly primary: TieredRetriever,
    private readonly fts: FtsRetriever,
    private readonly healthCheck: HealthCheck = getCachedVectorHealth
  ) {}

  async retrieve(query: string, ctx: RetrievalContext): Promise<IRetrievalChunk[]> {
    const result = await this.retrieveWithTiming(query, ctx);
    return result.chunks;
  }

  async retrieveWithTiming(query: string, ctx: RetrievalContext): Promise<DegradedRetrieveResult> {
    const health = await this.healthCheck();
    const vectorOk = health.store === 'ok' && health.embedder === 'ok';

    if (vectorOk) {
      try {
        const result = await this.primary.retrieveWithTiming(query, ctx);
        return {
          ...result,
          retrieverId: 'tiered-vector',
          degraded: false,
        };
      } catch {
        // fall through to FTS
      }
    }

    return this.ftsFallback(query, ctx);
  }

  private async ftsFallback(query: string, ctx: RetrievalContext): Promise<DegradedRetrieveResult> {
    const searchStart = Date.now();
    if (!isFtsFallbackEnabled()) {
      return {
        chunks: [],
        embedMs: 0,
        searchMs: Date.now() - searchStart,
        retrieverId: 'vector-unavailable',
        degraded: true,
      };
    }

    const topK = getTopK(ctx.tier);
    const scopes = ctx.scopes.filter((scope) => {
      if (scope === 'global') return ctx.globalKbEnabled;
      if (scope === 'session') return Boolean(ctx.sessionId);
      return true;
    });

    if (!scopes.includes('global')) {
      return {
        chunks: [],
        embedMs: 0,
        searchMs: Date.now() - searchStart,
        retrieverId: 'pg-tsvector-fallback',
        degraded: true,
      };
    }

    const chunks = await this.fts.search(query, { limit: topK });
    const searchMs = Date.now() - searchStart;

    return {
      chunks,
      embedMs: 0,
      searchMs,
      retrieverId: 'pg-tsvector-fallback',
      degraded: true,
    };
  }
}

