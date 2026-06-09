module.exports = {
    version: 9,
    name: 'add_semantic_layer_v02',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS domain_boundaries (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          level TEXT,
          max_allowed_strength TEXT,
          rules TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          username TEXT NOT NULL,
          claim_text TEXT NOT NULL,
          claim_type TEXT NOT NULL,
          reality_level TEXT NOT NULL,
          strength TEXT NOT NULL,
          evidence_basis TEXT,
          source_refs TEXT,
          source_span TEXT,
          domain_boundary_id TEXT,
          allowed_strength TEXT,
          downgraded_from TEXT,
          distortion_risks TEXT,
          requires_user_decision BOOLEAN DEFAULT 0,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id, username) REFERENCES sessions (id, username) ON DELETE CASCADE,
          FOREIGN KEY (domain_boundary_id) REFERENCES domain_boundaries (id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS semantic_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          username TEXT NOT NULL,
          run_id TEXT,
          event_type TEXT NOT NULL,
          claim_id TEXT,
          payload TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id, username) REFERENCES sessions (id, username) ON DELETE CASCADE,
          FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS distortion_hypotheses (
          id TEXT PRIMARY KEY,
          claim_id TEXT NOT NULL,
          hypothesis_text TEXT NOT NULL,
          confidence REAL,
          mitigation_strategy TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (claim_id) REFERENCES claims (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS conflict_cards (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          username TEXT NOT NULL,
          claim_a_id TEXT NOT NULL,
          claim_b_id TEXT NOT NULL,
          conflict_type TEXT NOT NULL,
          resolution_status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id, username) REFERENCES sessions (id, username) ON DELETE CASCADE,
          FOREIGN KEY (claim_a_id) REFERENCES claims (id) ON DELETE CASCADE,
          FOREIGN KEY (claim_b_id) REFERENCES claims (id) ON DELETE CASCADE
        );
      `);
    }
  };

