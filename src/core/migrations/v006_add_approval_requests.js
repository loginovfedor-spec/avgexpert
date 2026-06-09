module.exports = {
    version: 6,
    name: 'add_approval_requests',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS approval_requests (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          payload TEXT,
          risk_score INTEGER,
          reason TEXT,
          state TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE CASCADE
        );
      `);
    }
  };

