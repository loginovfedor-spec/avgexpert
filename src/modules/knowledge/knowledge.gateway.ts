import knowledgeRouter = require('./knowledge.router');
import { RetrievalResult } from './knowledge.types';
import { IRetrievalChunk } from '../../types/knowledge.types';
import { RetrievalMode } from '../../types/knowledge.types';
import knowledgeCache = require('./knowledge.cache');
import { formatRetrievalContext } from '../rag/format-context';
// @ts-ignore
import { KNOWLEDGE_GATEWAY_ENABLED } from '../../core/config';
import { PgTsvectorRetriever } from '../vector/retrievers/pg_tsvector.retriever';
// @ts-ignore
import traceBus = require('../observability/trace.bus');
// @ts-ignore
import logger = require('../../core/logger');

const knowledgeLogger = logger.scoped('KnowledgeGateway');

type Retriever = {
  search(query: string, config: Record<string, unknown>): Promise<IRetrievalChunk[]>;
};

type KnowledgeGatewaySettings = {
  rag_mode?: RetrievalMode | 'auto';
  retriever_id?: string;
  rag_answerability_policy?: string;
  [key: string]: unknown;
};

type RetrieveOptions = {
  settings?: KnowledgeGatewaySettings;
};

class KnowledgeGateway {
  private retrievers: Map<string, Retriever>;

  constructor() {
    this.retrievers = new Map();
    this._setupDefaultRetriever();
  }

  async retrieve(query: string, options: RetrieveOptions = {}) {
    const startTime = Date.now();
    traceBus.emitTrace('KnowledgeGateway', 'retrieval.started', { query: query.substring(0, 100) });

    if (!KNOWLEDGE_GATEWAY_ENABLED) {
      const res = new RetrievalResult({ query, mode: 'no_retrieval' });
      traceBus.emitTrace('KnowledgeGateway', 'retrieval.completed', { mode: 'no_retrieval', latencyMs: Date.now() - startTime });
      return res;
    }

    const { settings = {} } = options;
    
    const routerStart = Date.now();
    const { mode, config } = knowledgeRouter.resolveMode(query, settings);
    const routerMs = Date.now() - routerStart;
    
    if (mode === 'no_retrieval') {
      const res = new RetrievalResult({ query, mode, metadata: { routerMs, latencyMs: Date.now() - startTime } });
      traceBus.emitTrace('KnowledgeGateway', 'retrieval.completed', { mode: 'no_retrieval', latencyMs: Date.now() - startTime });
      return res;
    }

    const cachedResult = knowledgeCache.get(query);
    if (cachedResult) {
      cachedResult.metadata.cacheHit = true;
      cachedResult.metadata.latencyMs = Date.now() - startTime;
      traceBus.emitTrace('KnowledgeGateway', 'retrieval.completed', { mode: cachedResult.mode, cacheHit: true, latencyMs: Date.now() - startTime });
      return cachedResult;
    }

    try {
      const retrieverId = settings.retriever_id || 'default';
      let retriever = this.retrievers.get(retrieverId);
      
      if (!retriever) {
        knowledgeLogger.warn('Retriever not found. Falling back to default', { retrieverId });
        retriever = this.retrievers.get('default');
      }
      if (!retriever) {
        throw new Error('Default retriever is not registered');
      }

      const retrieverStart = Date.now();
      const chunks = await retriever.search(query, config);
      const retrieverMs = Date.now() - retrieverStart;
      
      const validationStart = Date.now();
      const result = new RetrievalResult({
        query,
        mode,
        chunks,
        metadata: {
          routerMs,
          retrieverMs,
          retrieverId
        }
      });
      result.validate();
      const validationMs = Date.now() - validationStart;

      result.metadata.validationMs = validationMs;
      result.metadata.latencyMs = Date.now() - startTime;
      
      const finalResult = this._applyPolicy(result, settings.rag_answerability_policy || 'balanced');
      
      if (!finalResult.metadata.error) {
        knowledgeCache.set(query, finalResult);
      }

      traceBus.emitTrace('KnowledgeGateway', 'retrieval.completed', { 
        mode: finalResult.mode, 
        chunkCount: finalResult.chunks.length, 
        latencyMs: finalResult.metadata.latencyMs 
      });

      return finalResult;

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      knowledgeLogger.error('Retrieval failed', { message });
      traceBus.emitTrace('KnowledgeGateway', 'retrieval.failed', { error: message, latencyMs: Date.now() - startTime });
      return new RetrievalResult({
        query,
        mode,
        metadata: { error: message, latencyMs: Date.now() - startTime }
      });
    }
  }

  registerRetriever(id: string, adapter: Retriever) {
    this.retrievers.set(id, adapter);
  }

  private _setupDefaultRetriever() {
    this.registerRetriever('default', new PgTsvectorRetriever());
    this.registerRetriever('mock', {
      search: async () => []
    });
  }

  private _applyPolicy(result: RetrievalResult, policy: string = 'balanced') {
    const RAG_MIN_SCORE = 0.3;
    const maxScore = result.chunks.length > 0 ? Math.max(...result.chunks.map(c => c.score)) : 0;
    
    if (result.chunks.length === 0 || maxScore < RAG_MIN_SCORE) {
      result.metadata.policyAction = result.chunks.length === 0 ? 'empty_context' : 'low_quality_context';
      
      if (policy === 'refusal') {
        result.metadata.shouldRefuse = true;
      } else if (policy === 'fast') {
        result.metadata.shouldRefuse = false;
      }
    }
    return result;
  }

  formatContext(result: RetrievalResult) {
    return formatRetrievalContext(result);
  }
}

export = new KnowledgeGateway();
