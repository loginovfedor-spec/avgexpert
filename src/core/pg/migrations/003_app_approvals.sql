-- D4: approval_requests (legacy MVP dashboard; was SQLite v006)

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload TEXT,
  risk_score INTEGER,
  reason TEXT,
  state TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_run_id ON approval_requests (run_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_state ON approval_requests (state);
