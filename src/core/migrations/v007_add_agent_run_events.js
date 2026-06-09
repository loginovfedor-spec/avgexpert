module.exports = {
    version: 7,
    name: 'add_agent_run_events',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS agent_run_events (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE CASCADE
        );
      `);
    }
  };

