import db from '../../core/sqlite';
import logger = require('../../core/logger');

const missionLogger = logger.scoped('MissionRepository');

type MissionRow = {
  id: string;
  session_id?: string | null;
  username?: string | null;
  goal?: string | null;
  status?: string;
  created_at?: number;
};

export class MissionRepository {
  static findById(id: string): MissionRow | null {
    try {
      const stmt = db.prepare('SELECT * FROM missions WHERE id = ?');
      return stmt.get(id) as MissionRow | undefined || null;
    } catch (_e) {
      // If table missing, return null
      return null;
    }
  }

  static create(data: { id: string; sessionId?: string; username?: string; goal?: string }): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO missions (id, session_id, username, goal, status, created_at)
        VALUES (?, ?, ?, ?, 'active', ?)
      `);
      stmt.run(data.id, data.sessionId || null, data.username || null, data.goal || null, Date.now());
    } catch (e) {
      missionLogger.warn('Failed to create mission', e);
    }
  }
}

module.exports = MissionRepository;
