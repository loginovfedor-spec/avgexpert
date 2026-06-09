import type { Pool } from 'pg';
import type { VectorStore } from '../ports/vector.store';
import type { VectorChunk, VectorFilter, VectorHit, VectorSearchParams } from '../types';
import { getPgPool } from '../pg/pool';

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function buildScopeClause(
  filter: VectorFilter | undefined,
  params: unknown[],
  startIndex: number
): { clause: string; nextIndex: number } {
  const clauses: string[] = [];
  let index = startIndex;

  if (filter?.namespace) {
    clauses.push(`namespace = $${index++}`);
    params.push(filter.namespace);
  }

  if (filter?.scope) {
    const scopes = Array.isArray(filter.scope) ? filter.scope : [filter.scope];
    clauses.push(`scope = ANY($${index++})`);
    params.push(scopes);
  }

  if (filter?.ownerUserId) {
    clauses.push(`owner_user_id = $${index++}`);
    params.push(filter.ownerUserId);
  }

  if (filter?.sessionId) {
    clauses.push(`session_id = $${index++}`);
    params.push(filter.sessionId);
  }

  if (filter?.docId) {
    clauses.push(`doc_id = $${index++}`);
    params.push(filter.docId);
  }

  return {
    clause: clauses.length > 0 ? clauses.join(' AND ') : 'TRUE',
    nextIndex: index,
  };
}

function mapRowToHit(row: Record<string, unknown>): VectorHit {
  return {
    id: String(row.id),
    namespace: String(row.namespace),
    scope: row.scope as VectorHit['scope'],
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
    sessionId: row.session_id ? String(row.session_id) : undefined,
    docId: row.doc_id ? String(row.doc_id) : undefined,
    body: String(row.body),
    title: row.title ? String(row.title) : undefined,
    score: Number(row.score),
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

export class PgVectorStore implements VectorStore {
  readonly id = 'pgvector';
  private readonly pool: Pool;
  private readonly dimensions: number;

  constructor(options: { connectionString?: string; dimensions: number; pool?: Pool }) {
    this.dimensions = options.dimensions;
    this.pool = options.pool || getPgPool(options.connectionString);
  }

  private assertEmbeddingDimensions(embedding: number[]): void {
    if (embedding.length !== this.dimensions) {
      throw new Error(
        `PgVectorStore: ожидалось ${this.dimensions} измерений, получено ${embedding.length}`
      );
    }
  }

  async upsert(chunks: VectorChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const chunk of chunks) {
        this.assertEmbeddingDimensions(chunk.embedding);
        await client.query(
          `
          INSERT INTO kb_chunks (
            id, namespace, scope, owner_user_id, session_id, doc_id,
            body, title, section_path, page_from, page_to, doc_type,
            book_id, book_title, chapter_index, chapter_title,
            section_index, section_title, domain_tags, entity_ids,
            chunk_index, token_count, embedding, checksum, metadata, indexed_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, $19, $20,
            $21, $22, $23::vector, $24, $25::jsonb, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            namespace = EXCLUDED.namespace,
            scope = EXCLUDED.scope,
            owner_user_id = EXCLUDED.owner_user_id,
            session_id = EXCLUDED.session_id,
            doc_id = EXCLUDED.doc_id,
            body = EXCLUDED.body,
            title = EXCLUDED.title,
            section_path = EXCLUDED.section_path,
            page_from = EXCLUDED.page_from,
            page_to = EXCLUDED.page_to,
            doc_type = EXCLUDED.doc_type,
            book_id = EXCLUDED.book_id,
            book_title = EXCLUDED.book_title,
            chapter_index = EXCLUDED.chapter_index,
            chapter_title = EXCLUDED.chapter_title,
            section_index = EXCLUDED.section_index,
            section_title = EXCLUDED.section_title,
            domain_tags = EXCLUDED.domain_tags,
            entity_ids = EXCLUDED.entity_ids,
            chunk_index = EXCLUDED.chunk_index,
            token_count = EXCLUDED.token_count,
            embedding = EXCLUDED.embedding,
            checksum = EXCLUDED.checksum,
            metadata = EXCLUDED.metadata,
            indexed_at = NOW()
          `,
          [
            chunk.id,
            chunk.namespace,
            chunk.scope,
            chunk.ownerUserId ?? null,
            chunk.sessionId ?? null,
            chunk.docId ?? null,
            chunk.body,
            chunk.title ?? null,
            chunk.sectionPath ?? null,
            chunk.pageFrom ?? null,
            chunk.pageTo ?? null,
            chunk.docType ?? null,
            chunk.bookId ?? null,
            chunk.bookTitle ?? null,
            chunk.chapterIndex ?? null,
            chunk.chapterTitle ?? null,
            chunk.sectionIndex ?? null,
            chunk.sectionTitle ?? null,
            chunk.domainTags ?? null,
            chunk.entityIds ?? null,
            chunk.chunkIndex ?? null,
            chunk.tokenCount ?? null,
            toVectorLiteral(chunk.embedding),
            chunk.checksum ?? null,
            JSON.stringify(chunk.metadata ?? {}),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async search(params: VectorSearchParams): Promise<VectorHit[]> {
    this.assertEmbeddingDimensions(params.embedding);
    const values: unknown[] = [toVectorLiteral(params.embedding)];
    const filter: VectorFilter = {
      namespace: params.namespace,
      ...params.filter,
    };
    const { clause, nextIndex } = buildScopeClause(filter, values, 2);
    const topK = params.topK ?? 10;
    values.push(topK);

    const result = await this.pool.query(
      `
      SELECT
        id, namespace, scope, owner_user_id, session_id, doc_id,
        body, title, metadata,
        1 - (embedding <=> $1::vector) AS score
      FROM kb_chunks
      WHERE ${clause}
      ORDER BY embedding <=> $1::vector
      LIMIT $${nextIndex}
      `,
      values
    );

    const minScore = params.minScore ?? 0;
    return result.rows
      .map((row: Record<string, unknown>) => mapRowToHit(row))
      .filter((hit: VectorHit) => hit.score >= minScore);
  }

  async delete(filter: VectorFilter): Promise<number> {
    const hasFilter = Boolean(
      filter.namespace || filter.scope || filter.ownerUserId || filter.sessionId || filter.docId
    );
    if (!hasFilter) {
      throw new Error('PgVectorStore.delete: требуется хотя бы один фильтр');
    }

    const values: unknown[] = [];
    const { clause } = buildScopeClause(filter, values, 1);
    const result = await this.pool.query(
      `DELETE FROM kb_chunks WHERE ${clause}`,
      values
    );
    return result.rowCount ?? 0;
  }

  async health(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1 AS ok');
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }
}

module.exports = { PgVectorStore };
