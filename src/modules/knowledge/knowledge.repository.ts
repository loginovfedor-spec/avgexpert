import db = require('../../core/sqlite');
import crypto = require('crypto');

type SourceInput = {
  uri: string;
  title: string;
  type: string;
  metadata?: Record<string, unknown>;
};

type KnowledgeSourceRow = {
  id: string;
  uri: string;
  title: string;
  type: string;
  checksum: string;
  metadata: string;
  created_at: number;
};

type KnowledgeSource = Omit<KnowledgeSourceRow, 'metadata'> & {
  metadata: Record<string, unknown>;
};

type ChunkInput = {
  text: string;
  metadata?: Record<string, unknown>;
};

type AddedChunk = {
  uuid: string;
  sourceId: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

type SearchRow = {
  uuid: string;
  source_id: string;
  text: string;
  metadata: string;
  source_title: string;
  source_uri: string;
  score: number;
};

class KnowledgeRepository {
  createSource({ uri, title, type, metadata = {} }: SourceInput) {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const checksum = crypto.createHash('md5').update(uri + title).digest('hex');

    db.prepare(`
      INSERT INTO knowledge_sources (id, uri, title, type, checksum, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, uri, title, type, checksum, JSON.stringify(metadata), createdAt);

    return { id, uri, title, type, checksum, metadata, createdAt };
  }

  getSource(id: string): KnowledgeSource | null {
    const row = db.prepare('SELECT * FROM knowledge_sources WHERE id = ?').get(id) as KnowledgeSourceRow | undefined;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata) };
  }

  listSources(): KnowledgeSource[] {
    return (db.prepare('SELECT * FROM knowledge_sources ORDER BY created_at DESC').all() as KnowledgeSourceRow[]).map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadata)
    }));
  }

  deleteSource(id: string): void {
    db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
  }

  addChunks(sourceId: string, chunks: ChunkInput[]): AddedChunk[] {
    const insert = db.prepare(`
      INSERT INTO knowledge_chunks (uuid, source_id, text, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const createdAt = Date.now();
    const results: AddedChunk[] = [];

    db.transaction(() => {
      for (const chunk of chunks) {
        const uuid = crypto.randomUUID();
        const metadata = JSON.stringify(chunk.metadata || {});
        insert.run(uuid, sourceId, chunk.text, metadata, createdAt);
        results.push({ uuid, sourceId, text: chunk.text, metadata: chunk.metadata, createdAt });
      }
    })();

    return results;
  }

  search(query: string, limit: number = 5) {
    const rows = db.prepare(`
      SELECT 
        c.uuid, 
        c.source_id, 
        c.text, 
        c.metadata, 
        s.title as source_title, 
        s.uri as source_uri,
        bm.rank as score
      FROM knowledge_chunks_fts f
      JOIN knowledge_chunks c ON c.id = f.rowid
      JOIN knowledge_sources s ON s.id = c.source_id
      JOIN (
        SELECT rowid, rank 
        FROM knowledge_chunks_fts 
        WHERE text MATCH ?
      ) bm ON bm.rowid = f.rowid
      ORDER BY bm.rank
      LIMIT ?
    `).all(query, limit) as SearchRow[];

    return rows.map(row => ({
      id: row.uuid,
      sourceId: row.source_id,
      text: row.text,
      score: this._normalizeScore(row.score),
      provenance: {
        uri: row.source_uri,
        title: row.source_title,
        ...JSON.parse(row.metadata)
      }
    }));
  }

  private _normalizeScore(rank: number): number {
    const score = 1 / (1 + Math.exp(rank)); 
    return Math.max(0, Math.min(1, score));
  }
}

export = new KnowledgeRepository();
