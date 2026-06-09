const missionRepository = require('../mission/mission.repository');
const logger = require('../../core/logger').scoped('MissionBinding');

class MissionBindingService {
  constructor() {
    this.missions = new Map();
  }

  /**
   * Ensures a mission exists for the given ID or creates a new one.
   */
  ensureMission(body, user) {
    const missionId = body.mission_id || body.missionId || `m-${Date.now()}`;
    
    // Check in-memory first
    let mission = this.missions.get(missionId);
    if (!mission) {
      // Check DB
      const dbMission = missionRepository.findById(missionId);
      if (dbMission) {
        mission = {
          id: dbMission.id, 
          goal: dbMission.goal, 
          sessionId: dbMission.session_id, 
          username: dbMission.username,
          conflicts: [],
          distinctions: []
        };
        this.missions.set(missionId, mission);
      } else if (body.sessionId || body.session_id) {
        // Create new if session provided
        mission = {
          id: missionId, 
          goal: body.goal || 'Analysis',
          sessionId: body.sessionId || body.session_id,
          username: user?.username || 'admin',
          conflicts: [],
          distinctions: []
        };
        this.missions.set(missionId, mission);
        
        // Also persist to DB to satisfy FKs for semantic layer
        try {
          missionRepository.create({
            id: missionId,
            sessionId: mission.sessionId,
            username: mission.username,
            goal: mission.goal
          });
        } catch (err) {
          logger.warn('Could not persist mission to DB', { missionId, message: err.message });
        }
      } else {
        // Fallback for fast path or mock
        mission = { id: missionId, goal: body.goal || 'Analysis', conflicts: [], distinctions: [] };
        this.missions.set(missionId, mission);
      }
    }
    
    return missionId;
  }

  getSessionId(missionId) {
    const mission = this.missions.get(missionId);
    if (mission && mission.sessionId) return mission.sessionId;
    
    const dbMission = missionRepository.findById(missionId);
    return dbMission ? dbMission.session_id : null;
  }

  addConflict(missionId, conflict) {
    const mission = this.missions.get(missionId);
    if (mission) mission.conflicts.push(conflict);
  }

  addDistinction(missionId, distinction) {
    const mission = this.missions.get(missionId);
    if (mission) mission.distinctions.push(distinction);
  }
}

module.exports = new MissionBindingService();
