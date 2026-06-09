import { RetrievalMode } from '../../types/knowledge.types';

type RetrievalModeConfig = {
  topK: number;
  searchDepth: 'shallow' | 'standard' | 'deep';
  rerank: boolean;
  expansion: boolean;
};

type KnowledgeRouterSettings = {
  rag_mode?: RetrievalMode | 'auto';
};

class KnowledgeRouter {
  resolveMode(query: string, settings: KnowledgeRouterSettings = {}): { mode: RetrievalMode; config: Partial<RetrievalModeConfig> } {
    const normalized = query.trim().toLowerCase();
    const trivialWords = ['hi', 'hello', 'thanks', 'thank you', 'ok', 'yes', 'no', 'bye'];
    if (normalized.length < 5 || trivialWords.includes(normalized)) {
      return { mode: 'no_retrieval', config: {} };
    }

    if (settings.rag_mode && settings.rag_mode !== 'auto') {
      return {
        mode: settings.rag_mode,
        config: this._getConfigForMode(settings.rag_mode)
      };
    }

    const mode = this._classifyQuery(query);
    
    return {
      mode,
      config: this._getConfigForMode(mode)
    };
  }

  private _classifyQuery(query: string): RetrievalMode {
    if (!query || query.length < 10) return 'fast';
    
    const complexKeywords = ['compare', 'analyze', 'summarize', 'difference', 'relationship', 'history'];
    const isComplex = complexKeywords.some(k => query.toLowerCase().includes(k));
    
    if (isComplex || query.length > 100) {
      return 'balanced';
    }
    
    return 'fast';
  }

  private _getConfigForMode(mode: RetrievalMode | string): RetrievalModeConfig {
    switch (mode) {
      case 'max_quality':
        return { topK: 10, searchDepth: 'deep', rerank: true, expansion: true };
      case 'balanced':
        return { topK: 5, searchDepth: 'standard', rerank: true, expansion: false };
      case 'fast':
      default:
        return { topK: 2, searchDepth: 'shallow', rerank: false, expansion: false };
    }
  }
}

export = new KnowledgeRouter();
