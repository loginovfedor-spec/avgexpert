import { getDatabasePort, ensureAppPgReady } from '../../core/pg';
import sessionRepository from '../chat/session.repository';
import logger from '../../core/logger';
const missionLogger = logger.scoped('MissionRepository');

type MissionRow = {
  id: string;
  session_id?: string | null;
  username?: string | null;
  goal?: string | null;
  created_at?: number;
  updated_at?: number;
};

export class MissionRepository {
  static async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  static async findById(id: string): Promise<MissionRow | null> {
    try {
      const db = await MissionRepository._db();
      return await db.get('SELECT * FROM missions WHERE id = @id', { id }) as MissionRow | null;
    } catch (_e) {
      return null;
    }
  }

  static async create(data: { id: string; sessionId?: string; username?: string; goal?: string }): Promise<void> {
    try {
      const sessionId = data.sessionId || null;
      const username = data.username || null;
      if (sessionId && username) {
        await sessionRepository.ensureRow(sessionId, username);
      }

      const now = Date.now();
      const db = await MissionRepository._db();
      await db.run(`
        INSERT INTO missions (id, session_id, username, goal, created_at, updated_at)
        VALUES (@id, @sessionId, @username, @goal, @createdAt, @updatedAt)
        ON CONFLICT (id) DO NOTHING
      `, {
        id: data.id,
        sessionId,
        username,
        goal: data.goal || null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      missionLogger.warn('Failed to create mission', e);
    }
  }
}

