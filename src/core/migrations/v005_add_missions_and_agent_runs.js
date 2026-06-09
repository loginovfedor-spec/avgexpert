module.exports = {
    version: 5,
    name: 'add_missions_and_agent_runs',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS missions (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          username TEXT NOT NULL,
          semantic_protocol_id TEXT,
          glossary_version TEXT,
          mode TEXT,
          goal TEXT,
          constraints TEXT,
          open_questions TEXT,
          context TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (session_id, username) REFERENCES sessions (id, username) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_runs (
          id TEXT PRIMARY KEY,
          mission_id TEXT NOT NULL,
          state TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (mission_id) REFERENCES missions (id) ON DELETE CASCADE
        );
      `);
    }
  };

