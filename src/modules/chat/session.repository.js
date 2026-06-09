const db = require('../../core/sqlite');

class SessionRepository {
  async findById(username, id) {
    const row = db.prepare('SELECT * FROM sessions WHERE username = ? AND id = ?').get(username, id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      messages: JSON.parse(row.messages),
      updatedAt: row.updatedAt,
    };
  }

  async listByUser(username) {
    return db.prepare(`
      SELECT id, title, category, updatedAt, 
      (SELECT count(*) FROM json_each(sessions.messages)) as messageCount 
      FROM sessions WHERE username = ? ORDER BY updatedAt DESC
    `).all(username);
  }

  async save(username, sessionData) {
    db.prepare(`
      INSERT INTO sessions (id, username, title, messages, category, updatedAt)
      VALUES (@id, @username, @title, @messages, @category, @updatedAt)
      ON CONFLICT(id, username) DO UPDATE SET
        title=excluded.title,
        messages=excluded.messages,
        category=excluded.category,
        updatedAt=excluded.updatedAt
    `).run({
      id: sessionData.id,
      username,
      title: sessionData.title,
      messages: JSON.stringify(sessionData.messages || []),
      category: sessionData.category || null,
      updatedAt: sessionData.updatedAt || Date.now(),
    });
  }

  async delete(username, id) {
    const info = db.prepare('DELETE FROM sessions WHERE username = ? AND id = ?').run(username, id);
    return info.changes > 0;
  }

  async updateTitle(username, id, title) {
    const info = db.prepare(`
      UPDATE sessions SET title = ?, updatedAt = ? 
      WHERE username = ? AND id = ?
    `).run(title, Date.now(), username, id);
    return info.changes > 0;
  }

  async countTotal() {
    return db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
  }
}

module.exports = new SessionRepository();
