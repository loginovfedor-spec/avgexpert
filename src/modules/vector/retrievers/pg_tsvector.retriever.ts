import type { IRetrievalChunk } from '../../../types/knowledge.types';
import { getPgPool } from '../pg/pool';
import { loadEmbeddingConfig } from '../embedding.service';
import logger = require('../../../core/logger');

const log = logger.scoped('PgTsvectorRetriever');

type PgTsvectorConfig = {
  limit?: number;
  minScore?: number;
  namespace?: string;
};

function mapRow(row: Record<string, unknown>): IRetrievalChunk {
  const meta = (row.metadata as Record<string, unknown>) || {};
  const title = row.title ? String(row.title) : (meta.book_title as string) || 'Untitled';
  const uri = (meta.source_uri as string) || (row.doc_id ? String(row.doc_id) : String(row.id));

  return {
    id: String(row.id),
    sourceId: row.doc_id ? String(row.doc_id) : String(row.id),
    text: String(row.body),
    score: Number(row.score),
    provenance: {
      title,
      uri,
      scope: row.scope,
      namespace: row.namespace,
      ...meta,
    },
  };
}

export class PgTsvectorRetriever {
  async search(query: string, config: PgTsvectorConfig = {}): Promise<IRetrievalChunk[]> {
    const limit = config.limit ?? 5;
    const minScore = config.minScore ?? 0.01;
    const namespace = config.namespace ?? loadEmbeddingConfig().namespace;

    try {
      const pool = getPgPool();
      const result = await pool.query(
        `
        SELECT
          c.id,
          c.doc_id,
          c.body,
          c.title,
          c.scope,
          c.namespace,
          c.metadata,
          ts_rank_cd(c.body_tsv, websearch_to_tsquery('russian', $1)) AS score
        FROM kb_chunks c
        WHERE c.namespace = $2
          AND c.scope = 'global'
          AND c.body_tsv @@ websearch_to_tsquery('russian', $1)
        ORDER BY score DESC
        LIMIT $3
        `,
        [query, namespace, limit]
      );

      return result.rows
        .map((row) => mapRow(row))
        .filter((chunk) => chunk.score >= minScore);
    } catch (error: unknown) {
      log.error('Search error', { message: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
}

module.exports = { PgTsvectorRetriever };
