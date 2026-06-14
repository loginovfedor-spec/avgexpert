import { getDatabasePort, ensureAppPgReady, isAppPgEnabled } from '../../core/pg';
import { purgeSessionKb } from '../kb/session-gc';

type SessionMessage = Record<string, unknown>;

type SessionData = {
  id: string;
  title?: string;
  messages?: SessionMessage[];
  category?: string | null;
  updatedAt?: number;
};

type SessionRow = {
  id: string;
  title: string;
  category: string | null;
  messages: string;
  updated_at?: number;
  updatedAt?: number;
};

type SessionListItem = {
  id: string;
  title: string;
  category: string | null;
  updatedAt: number;
  messageCount: number;
};

class SessionRepository {
  async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  _mapRow(row: SessionRow) {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      messages: JSON.parse(row.messages || '[]') as SessionMessage[],
      updatedAt: row.updated_at ?? row.updatedAt,
    };
  }

  async findById(username: string, id: string) {
    const db = await this._db();
    const row = await db.get(
      'SELECT * FROM sessions WHERE username = @username AND id = @id',
      { username, id }
    ) as SessionRow | null;
    if (!row) return null;
    return this._mapRow(row);
  }

  async listByUser(username: string): Promise<SessionListItem[]> {
    const db = await this._db();
    if (isAppPgEnabled()) {
      return db.all(`
        SELECT id, title, category, updated_at AS "updatedAt",
          COALESCE(jsonb_array_length(messages::jsonb), 0) AS "messageCount"
        FROM sessions
        WHERE username = @username
        ORDER BY updated_at DESC
      `, { username }) as Promise<SessionListItem[]>;
    }

    return db.all(`
      SELECT id, title, category, updatedAt,
        (SELECT count(*) FROM json_each(sessions.messages)) AS messageCount
      FROM sessions
      WHERE username = @username
      ORDER BY updatedAt DESC
    `, { username }) as Promise<SessionListItem[]>;
  }

  async save(username: string, sessionData: SessionData): Promise<void> {
    const db = await this._db();
    const updatedAt = sessionData.updatedAt || Date.now();
    const messages = JSON.stringify(sessionData.messages || []);

    if (isAppPgEnabled()) {
      await db.run(`
        INSERT INTO sessions (id, username, title, messages, category, updated_at)
        VALUES (@id, @username, @title, @messages, @category, @updatedAt)
        ON CONFLICT (id, username) DO UPDATE SET
          title = EXCLUDED.title,
          messages = EXCLUDED.messages,
          category = EXCLUDED.category,
          updated_at = EXCLUDED.updated_at
      `, {
        id: sessionData.id,
        username,
        title: sessionData.title,
        messages,
        category: sessionData.category || null,
        updatedAt,
      });
      return;
    }

    await db.run(`
      INSERT INTO sessions (id, username, title, messages, category, updatedAt)
      VALUES (@id, @username, @title, @messages, @category, @updatedAt)
      ON CONFLICT(id, username) DO UPDATE SET
        title = excluded.title,
        messages = excluded.messages,
        category = excluded.category,
        updatedAt = excluded.updatedAt
    `, {
      id: sessionData.id,
      username,
      title: sessionData.title,
      messages,
      category: sessionData.category || null,
      updatedAt,
    });
  }

  async delete(username: string, id: string): Promise<boolean> {
    await purgeSessionKb(username, id);
    const db = await this._db();
    const info = await db.run(
      'DELETE FROM sessions WHERE username = @username AND id = @id',
      { username, id }
    );
    return info.changes > 0;
  }

  async updateTitle(username: string, id: string, title: string): Promise<boolean> {
    const db = await this._db();
    const updatedAt = Date.now();
    const sql = isAppPgEnabled()
      ? 'UPDATE sessions SET title = @title, updated_at = @updatedAt WHERE username = @username AND id = @id'
      : 'UPDATE sessions SET title = @title, updatedAt = @updatedAt WHERE username = @username AND id = @id';
    const info = await db.run(sql, { title, updatedAt, username, id });
    return info.changes > 0;
  }

  async countTotal(): Promise<number> {
    const db = await this._db();
    const row = await db.get(
      isAppPgEnabled()
        ? 'SELECT COUNT(*)::int AS c FROM sessions'
        : 'SELECT COUNT(*) AS c FROM sessions'
    ) as { c: number };
    return row.c;
  }

  async ensureRow(sessionId: string, username: string, title = 'Chat'): Promise<void> {
    const db = await this._db();
    const updatedAt = Date.now();
    if (isAppPgEnabled()) {
      await db.run(`
        INSERT INTO sessions (id, username, title, messages, category, updated_at)
        VALUES (@id, @username, @title, '[]', NULL, @updatedAt)
        ON CONFLICT (id, username) DO NOTHING
      `, { id: sessionId, username, title, updatedAt });
      return;
    }

    await db.run(`
      INSERT OR IGNORE INTO sessions (id, username, title, messages, category, updatedAt)
      VALUES (@id, @username, @title, '[]', NULL, @updatedAt)
    `, { id: sessionId, username, title, updatedAt });
  }
}

export = new SessionRepository();
