import type { Pool, PoolClient } from 'pg';
import type { KbDocumentRecord, VectorScope } from '../vector/types';
import { getPgPool } from '../vector/pg/pool';

export interface CreateKbDocumentParams {
  id: string;
  scope: VectorScope;
  filename: string;
  ownerUserId?: string;
  sessionId?: string;
  mime?: string;
  size?: number;
  sourceUri?: string;
  status?: KbDocumentRecord['status'];
}

function mapRow(row: Record<string, unknown>): KbDocumentRecord {
  return {
    id: String(row.id),
    scope: row.scope as VectorScope,
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
    sessionId: row.session_id ? String(row.session_id) : undefined,
    filename: String(row.filename),
    mime: row.mime ? String(row.mime) : undefined,
    size: row.size != null ? Number(row.size) : undefined,
    status: row.status as KbDocumentRecord['status'],
    sourceUri: row.source_uri ? String(row.source_uri) : undefined,
  };
}

export class KbRepository {
  private readonly pool: Pool;

  constructor(options: { connectionString?: string; pool?: Pool } = {}) {
    this.pool = options.pool || getPgPool(options.connectionString);
  }

  async createDocument(params: CreateKbDocumentParams): Promise<KbDocumentRecord> {
    return this.createDocumentWithClient(this.pool, params);
  }

  async createDocumentWithClient(
    client: Pool | PoolClient,
    params: CreateKbDocumentParams
  ): Promise<KbDocumentRecord> {
    const status = params.status || 'pending';
    const result = await client.query(
      `
      INSERT INTO kb_documents (
        id, scope, owner_user_id, session_id, filename, mime, size, status, source_uri
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        params.id,
        params.scope,
        params.ownerUserId ?? null,
        params.sessionId ?? null,
        params.filename,
        params.mime ?? null,
        params.size ?? null,
        status,
        params.sourceUri ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  }

  async updateStatus(id: string, status: KbDocumentRecord['status']): Promise<void> {
    await this.pool.query(
      `
      UPDATE kb_documents
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      `,
      [id, status]
    );
  }

  async findById(id: string): Promise<KbDocumentRecord | null> {
    const result = await this.pool.query('SELECT * FROM kb_documents WHERE id = $1', [id]);
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  }

  async deleteDocument(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM kb_documents WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async findByIdForOwner(
    id: string,
    ownerUserId: string,
    scope: VectorScope = 'user',
    sessionId?: string
  ): Promise<KbDocumentRecord | null> {
    if (scope === 'session' && sessionId) {
      const result = await this.pool.query(
        'SELECT * FROM kb_documents WHERE id = $1 AND owner_user_id = $2 AND scope = $3 AND session_id = $4',
        [id, ownerUserId, scope, sessionId]
      );
      if (result.rowCount === 0) return null;
      return mapRow(result.rows[0]);
    }

    const result = await this.pool.query(
      'SELECT * FROM kb_documents WHERE id = $1 AND owner_user_id = $2 AND scope = $3',
      [id, ownerUserId, scope]
    );
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  }

  async findByIdForSession(
    id: string,
    ownerUserId: string,
    sessionId: string
  ): Promise<KbDocumentRecord | null> {
    return this.findByIdForOwner(id, ownerUserId, 'session', sessionId);
  }

  async listBySession(ownerUserId: string, sessionId: string): Promise<KbDocumentRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM kb_documents
      WHERE owner_user_id = $1 AND scope = 'session' AND session_id = $2
      ORDER BY created_at DESC
      `,
      [ownerUserId, sessionId]
    );
    return result.rows.map((row: Record<string, unknown>) => mapRow(row));
  }

  async countBySession(
    ownerUserId: string,
    sessionId: string,
    client: Pool | PoolClient = this.pool
  ): Promise<number> {
    const result = await client.query(
      `
      SELECT COUNT(*)::int AS count FROM kb_documents
      WHERE owner_user_id = $1 AND scope = 'session' AND session_id = $2 AND status <> 'failed'
      `,
      [ownerUserId, sessionId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async withAdvisoryLock<T>(lockKey: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async markStaleIngestJobs(maxAgeMs: number): Promise<number> {
    const result = await this.pool.query(
      `
      UPDATE kb_documents
      SET status = 'failed', updated_at = NOW()
      WHERE status IN ('pending', 'processing')
        AND updated_at < NOW() - ($1::int * interval '1 millisecond')
      `,
      [maxAgeMs]
    );
    return result.rowCount ?? 0;
  }

  async listByOwner(ownerUserId: string, scope: VectorScope = 'user'): Promise<KbDocumentRecord[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM kb_documents
      WHERE owner_user_id = $1 AND scope = $2
      ORDER BY created_at DESC
      `,
      [ownerUserId, scope]
    );
    return result.rows.map((row: Record<string, unknown>) => mapRow(row));
  }

  async countByOwner(ownerUserId: string, scope: VectorScope = 'user', client: Pool | PoolClient = this.pool): Promise<number> {
    const result = await client.query(
      `
      SELECT COUNT(*)::int AS count FROM kb_documents
      WHERE owner_user_id = $1 AND scope = $2 AND status <> 'failed'
      `,
      [ownerUserId, scope]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countChunksByDocId(docId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM kb_chunks WHERE doc_id = $1',
      [docId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getChunkMetadataStats(docId: string): Promise<{
    total: number;
    withSectionPath: number;
    withBookTitle: number;
    withChapterTitle: number;
  }> {
    const result = await this.pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE section_path IS NOT NULL AND section_path <> '')::int AS with_section_path,
        COUNT(*) FILTER (WHERE book_title IS NOT NULL AND book_title <> '')::int AS with_book_title,
        COUNT(*) FILTER (WHERE chapter_title IS NOT NULL AND chapter_title <> '')::int AS with_chapter_title
      FROM kb_chunks
      WHERE doc_id = $1
      `,
      [docId]
    );
    const row = result.rows[0];
    return {
      total: Number(row.total ?? 0),
      withSectionPath: Number(row.with_section_path ?? 0),
      withBookTitle: Number(row.with_book_title ?? 0),
      withChapterTitle: Number(row.with_chapter_title ?? 0),
    };
  }
}

