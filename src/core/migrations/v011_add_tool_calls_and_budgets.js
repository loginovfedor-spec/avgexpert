module.exports = {
    version: 11,
    name: 'add_tool_calls_and_budgets',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS tool_calls (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          args TEXT,
          state TEXT NOT NULL,
          idempotency_key TEXT,
          policy_decision TEXT,
          approval_id TEXT,
          result_ref TEXT,
          error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE CASCADE,
          FOREIGN KEY (approval_id) REFERENCES approval_requests (id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS budget_records (
          id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL, -- 'user', 'run', 'project'
          owner_id TEXT NOT NULL,
          max_cost_usd REAL,
          current_cost_usd REAL DEFAULT 0,
          currency TEXT DEFAULT 'USD',
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cost_events (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          action_type TEXT,
          action_id TEXT,
          cost_usd REAL NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE SET NULL
        );
      `);
    }
  };

