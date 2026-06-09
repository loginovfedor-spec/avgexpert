import knowledgeRepository = require('../knowledge.repository');
import { IRetrievalChunk } from '../../../types/knowledge.types';
import logger = require('../../../core/logger');

const sqliteFtsLogger = logger.scoped('SQLiteFTSRetriever');

type SQLiteFTSConfig = {
  limit?: number;
  minScore?: number;
  [key: string]: unknown;
};

class SQLiteFTSRetriever {
  async search(query: string, config: SQLiteFTSConfig = {}): Promise<IRetrievalChunk[]> {
    const limit = config.limit || 5;
    const minScore = config.minScore || 0.1;

    try {
      const results = knowledgeRepository.search(query, limit);
      return results.filter((r) => r.score >= minScore);
    } catch (error: unknown) {
      sqliteFtsLogger.error('Search error', { message: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
}

export = SQLiteFTSRetriever;
