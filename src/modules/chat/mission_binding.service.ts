import { MissionRepository } from '../mission/mission.repository';
import logger from '../../core/logger';
const missionBindingLogger = logger.scoped('MissionBinding');

type MissionConflict = Record<string, unknown>;
type MissionDistinction = Record<string, unknown>;

type InMemoryMission = {
  id: string;
  goal: string;
  sessionId?: string;
  username?: string;
  conflicts: MissionConflict[];
  distinctions: MissionDistinction[];
};

type MissionBody = Record<string, unknown> & {
  mission_id?: string;
  missionId?: string;
  sessionId?: string;
  session_id?: string;
  goal?: string;
};

type MissionUser = Record<string, unknown> & {
  username?: string;
};

class MissionBindingService {
  missions = new Map<string, InMemoryMission>();

  async ensureMission(body: MissionBody, user: MissionUser): Promise<string> {
    const missionId = body.mission_id || body.missionId || `m-${Date.now()}`;

    let mission = this.missions.get(missionId);
    if (!mission) {
      const dbMission = await MissionRepository.findById(missionId);
      if (dbMission) {
        mission = {
          id: dbMission.id,
          goal: dbMission.goal || 'Analysis',
          sessionId: dbMission.session_id ?? undefined,
          username: dbMission.username ?? undefined,
          conflicts: [],
          distinctions: [],
        };
        this.missions.set(missionId, mission);
      } else if (body.sessionId || body.session_id) {
        mission = {
          id: missionId,
          goal: body.goal || 'Analysis',
          sessionId: (body.sessionId || body.session_id) as string,
          username: user?.username || 'admin',
          conflicts: [],
          distinctions: [],
        };
        this.missions.set(missionId, mission);

        try {
          await MissionRepository.create({
            id: missionId,
            sessionId: mission.sessionId,
            username: mission.username,
            goal: mission.goal,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          missionBindingLogger.warn('Could not persist mission to DB', { missionId, message });
        }
      } else {
        mission = { id: missionId, goal: body.goal || 'Analysis', conflicts: [], distinctions: [] };
        this.missions.set(missionId, mission);
      }
    }

    return missionId;
  }

  async getSessionId(missionId: string): Promise<string | null> {
    const mission = this.missions.get(missionId);
    if (mission?.sessionId) return mission.sessionId;

    const dbMission = await MissionRepository.findById(missionId);
    return dbMission?.session_id ?? null;
  }

  addConflict(missionId: string, conflict: MissionConflict): void {
    const mission = this.missions.get(missionId);
    if (mission) mission.conflicts.push(conflict);
  }

  addDistinction(missionId: string, distinction: MissionDistinction): void {
    const mission = this.missions.get(missionId);
    if (mission) mission.distinctions.push(distinction);
  }
}

export = new MissionBindingService();
