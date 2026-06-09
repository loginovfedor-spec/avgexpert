module.exports = {
    version: 24,
    name: 'add_query_performance_indexes',
    up: (txDb) => {
      txDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_username_updatedAt ON sessions(username, updatedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_username_created_at ON audit_logs(username, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_mission_id ON agent_runs(mission_id);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_state ON agent_runs(state);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);
      `);
    }
  };

