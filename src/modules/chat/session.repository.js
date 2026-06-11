const { getDatabasePort, ensureAppPgReady, isAppPgEnabled } = require('../../core/pg');
const { purgeSessionKb } = require('../kb/session-gc');

class SessionRepository {
  async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  _mapRow(row) {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      messages: JSON.parse(row.messages || '[]'),
      updatedAt: row.updated_at ?? row.updatedAt,
    };
  }

  async findById(username, id) {
    const db = await this._db();
    const row = await db.get(
      'SELECT * FROM sessions WHERE username = @username AND id = @id',
      { username, id }
    );
    if (!row) return null;
    return this._mapRow(row);
  }

  async listByUser(username) {
    const db = await this._db();
    if (isAppPgEnabled()) {
      return db.all(`
        SELECT id, title, category, updated_at AS "updatedAt",
          COALESCE(jsonb_array_length(messages::jsonb), 0) AS "messageCount"
        FROM sessions
        WHERE username = @username
        ORDER BY updated_at DESC
      `, { username });
    }

    return db.all(`
      SELECT id, title, category, updatedAt,
        (SELECT count(*) FROM json_each(sessions.messages)) AS messageCount
      FROM sessions
      WHERE username = @username
      ORDER BY updatedAt DESC
    `, { username });
  }

  async save(username, sessionData) {
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

  async delete(username, id) {
    await purgeSessionKb(username, id);
    const db = await this._db();
    const info = await db.run(
      'DELETE FROM sessions WHERE username = @username AND id = @id',
      { username, id }
    );
    return info.changes > 0;
  }

  async updateTitle(username, id, title) {
    const db = await this._db();
    const updatedAt = Date.now();
    const sql = isAppPgEnabled()
      ? `UPDATE sessions SET title = @title, updated_at = @updatedAt WHERE username = @username AND id = @id`
      : `UPDATE sessions SET title = @title, updatedAt = @updatedAt WHERE username = @username AND id = @id`;
    const info = await db.run(sql, { title, updatedAt, username, id });
    return info.changes > 0;
  }

  async countTotal() {
    const db = await this._db();
    const row = await db.get(
      isAppPgEnabled()
        ? 'SELECT COUNT(*)::int AS c FROM sessions'
        : 'SELECT COUNT(*) AS c FROM sessions'
    );
    return row.c;
  }

  async ensureRow(sessionId, username, title = 'Chat') {
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

module.exports = new SessionRepository();
