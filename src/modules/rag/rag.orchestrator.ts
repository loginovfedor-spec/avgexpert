import type { RetrievalContext } from '../vector/ports/retriever';
import { RetrievalResult } from '../knowledge/knowledge.types';
import { TieredRetriever } from '../vector/retrievers/tiered.retriever';
import { DegradedRetriever } from '../vector/retrievers/degraded.retriever';
import { createTieredRetrieverFromEnv } from '../vector/registry';
import { loadEmbeddingConfig } from '../vector/embedding.service';
import {
  buildScopedCacheKey,
  scopedRetrievalCache,
} from './scoped.cache';
import { formatRetrievalContext } from './format-context';
import { documentContextResolver } from './document-context.resolver';
// @ts-ignore
import traceBus = require('../observability/trace.bus');
// @ts-ignore
import { RAG_V2_ENABLED } from '../../core/config';

const NATIVE_RAG_KEYS = [
  'collection_ids',
  'vector_store_ids',
  'GROK_COLLECTION_IDS',
  'enable_search',
  'file_search',
] as const;

/** Gateway-only keys stored in category extra_params; must not reach LLM provider APIs. */
const GATEWAY_ONLY_EXTRA_PARAM_KEYS = [
  'global_kb_enabled',
  'user_kb_enabled',
  'session_kb_enabled',
  'rag_mode',
  'rag_answerability_policy',
  'endpoint_url',
  'api_key',
] as const;

type CategorySettings = {
  rag_allowed?: boolean | number;
  rag_enabled?: boolean | number;
  retrieval_tier?: string;
  rag_answerability_policy?: string;
  rag_mode?: string;
  extra_params?: Record<string, unknown>;
};

type RagUser = {
  id?: string;
  username?: string;
  rag_enabled?: boolean | number;
};

type ResolveInput = {
  catSettings: CategorySettings;
  mergedSettings: Record<string, unknown>;
};

type RetrieveInput = {
  query: string;
  catSettings: CategorySettings;
  user: RagUser;
  sessionId?: string;
};

type RagOrchestratorDeps = {
  retriever?: DegradedRetriever | TieredRetriever;
  namespace?: string;
  cache?: typeof scopedRetrievalCache;
};

function stripNativeRag(extraParams: Record<string, unknown> = {}): Record<string, unknown> {
  const cleaned = { ...extraParams };
  for (const key of NATIVE_RAG_KEYS) {
    delete cleaned[key];
  }
  for (const key of GATEWAY_ONLY_EXTRA_PARAM_KEYS) {
    delete cleaned[key];
  }

  if (Array.isArray(cleaned.tools)) {
    cleaned.tools = cleaned.tools.filter((tool) => {
      if (!tool || typeof tool !== 'object') return true;
      const typed = tool as { type?: string };
      return typed.type !== 'file_search';
    });
  }

  return cleaned;
}

function buildRetrievalContext(
  catSettings: CategorySettings,
  user: RagUser,
  sessionId?: string
): RetrievalContext {
  return documentContextResolver.resolve({
    retrievalTier: catSettings.retrieval_tier,
    extraParams: catSettings.extra_params,
    userId: String(user.id || user.username || 'anonymous'),
    sessionId,
  });
}

function applyAnswerabilityPolicy(
  result: RetrievalResult,
  policy: string = 'balanced'
): RetrievalResult {
  const RAG_MIN_SCORE = 0.3;
  const maxScore = result.chunks.length > 0
    ? Math.max(...result.chunks.map((c) => c.score))
    : 0;

  if (result.chunks.length === 0 || maxScore < RAG_MIN_SCORE) {
    result.metadata.policyAction = result.chunks.length === 0
      ? 'empty_context'
      : 'low_quality_context';

    if (policy === 'refusal') {
      result.metadata.shouldRefuse = true;
    } else if (policy === 'fast') {
      result.metadata.shouldRefuse = false;
    }
  }

  return result;
}

export class RagOrchestrator {
  private readonly retriever: DegradedRetriever | TieredRetriever;
  private readonly namespace: string;
  private readonly cache: typeof scopedRetrievalCache;

  constructor(deps: RagOrchestratorDeps = {}) {
    if (deps.retriever) {
      this.retriever = deps.retriever;
      this.namespace = deps.namespace || loadEmbeddingConfig().namespace;
    } else {
      const tiered = createTieredRetrieverFromEnv();
      this.namespace = loadEmbeddingConfig().namespace;
      // @ts-ignore legacy JS adapter default export
      const SQLiteFTSRetriever = require('../knowledge/adapters/sqlite_fts.adapter');
      this.retriever = new DegradedRetriever(tiered, new SQLiteFTSRetriever());
    }
    this.cache = deps.cache || scopedRetrievalCache;
  }

  shouldUseRagV2(catSettings: CategorySettings, user?: RagUser): boolean {
    // @ts-ignore
    const { isRagEffective } = require('./rag.policy');
    return Boolean(RAG_V2_ENABLED && isRagEffective(catSettings, user));
  }

  resolve({ catSettings, mergedSettings }: ResolveInput): Record<string, unknown> {
    if (!this.shouldUseRagV2(catSettings)) {
      return mergedSettings;
    }

    const extraParams = (mergedSettings.extra_params as Record<string, unknown>) || {};
    return {
      ...mergedSettings,
      extra_params: stripNativeRag(extraParams),
    };
  }

  async retrieve({
    query,
    catSettings,
    user,
    sessionId,
  }: RetrieveInput): Promise<RetrievalResult> {
    const startTime = Date.now();
    const ctx = buildRetrievalContext(catSettings, user, sessionId);
    const cacheKey = buildScopedCacheKey({
      query,
      namespace: this.namespace,
      tier: ctx.tier,
      scopes: ctx.scopes,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      semanticGraphEnabled: ctx.semanticGraphEnabled,
    });

    const cached = this.cache.get(cacheKey);
    if (cached) {
      const latencyMs = Date.now() - startTime;
      const cachedResult = new RetrievalResult({
        query: cached.query,
        mode: cached.mode,
        chunks: cached.chunks,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
          latencyMs,
        },
      });
      traceBus.emitTrace('RagOrchestrator', 'rag.cache_hit', {
        tier: ctx.tier,
        cacheHit: true,
        latencyMs,
      });
      return cachedResult;
    }

    traceBus.emitTrace('RagOrchestrator', 'retrieval.started', {
      tier: ctx.tier,
      scopes: ctx.scopes,
    });

    try {
      const timing = await this.retriever.retrieveWithTiming(query, ctx);
      const { chunks, embedMs, searchMs, rerankMs = 0 } = timing;
      const retrieverId = ('retrieverId' in timing && typeof timing.retrieverId === 'string')
        ? timing.retrieverId
        : 'tiered-vector';
      const degraded = ('degraded' in timing && typeof timing.degraded === 'boolean')
        ? timing.degraded
        : false;

      traceBus.emitTrace('RagOrchestrator', 'rag.embed_ms', { embedMs, tier: ctx.tier });
      traceBus.emitTrace('RagOrchestrator', 'rag.search_ms', {
        searchMs,
        tier: ctx.tier,
        chunkCount: chunks.length,
        degraded: Boolean(degraded),
      });
      if (rerankMs > 0) {
        traceBus.emitTrace('RagOrchestrator', 'rag.rerank_ms', {
          rerankMs,
          tier: ctx.tier,
          chunkCount: chunks.length,
        });
      }

      const result = new RetrievalResult({
        query,
        mode: 'balanced',
        chunks,
        metadata: {
          retrieverId,
          embedMs,
          searchMs,
          rerankMs,
          degraded: Boolean(degraded),
          latencyMs: Date.now() - startTime,
        },
      });
      result.validate();

      const finalResult = applyAnswerabilityPolicy(
        result,
        catSettings.rag_answerability_policy || 'balanced'
      );

      if (!finalResult.metadata.error && !degraded) {
        this.cache.set(cacheKey, finalResult);
      }

      const maxChunkScore = finalResult.chunks.length > 0
        ? Math.max(...finalResult.chunks.map((c) => c.score))
        : 0;

      traceBus.emitTrace('RagOrchestrator', 'retrieval.completed', {
        tier: ctx.tier,
        chunkCount: finalResult.chunks.length,
        cacheHit: false,
        embedMs,
        searchMs,
        rerankMs,
        latencyMs: finalResult.metadata.latencyMs,
        degraded: Boolean(degraded),
        maxChunkScore,
      });

      return finalResult;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      traceBus.emitTrace('RagOrchestrator', 'retrieval.failed', {
        tier: ctx.tier,
        error: message,
        latencyMs: Date.now() - startTime,
      });

      return new RetrievalResult({
        query,
        mode: 'balanced',
        metadata: {
          retrieverId: 'tiered-vector',
          error: message,
          latencyMs: Date.now() - startTime,
        },
      });
    }
  }

  formatContext(result: RetrievalResult): string {
    return formatRetrievalContext(result);
  }
}

const ragOrchestrator = new RagOrchestrator();

module.exports = {
  RagOrchestrator,
  ragOrchestrator,
  stripNativeRag,
  buildRetrievalContext,
};
