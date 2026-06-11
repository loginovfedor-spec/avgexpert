-- D3: sessions, missions, payments, audit, LLM cache

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT NOT NULL,
  username TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  title TEXT,
  messages TEXT NOT NULL DEFAULT '[]',
  category TEXT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (id, username)
);

CREATE INDEX IF NOT EXISTS idx_sessions_username_updated_at
  ON sessions (username, updated_at DESC);

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
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (session_id, username) REFERENCES sessions (id, username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_missions_session_username
  ON missions (session_id, username);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  metadata TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_mission_id ON agent_runs (mission_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_state ON agent_runs (state);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS payment_orders (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  package_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  tokens INTEGER NOT NULL,
  amount_rub INTEGER NOT NULL,
  inv_id INTEGER UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  robokassa_out_sum TEXT,
  robokassa_fee TEXT,
  payment_method TEXT,
  signature TEXT,
  created_at BIGINT NOT NULL,
  paid_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_username ON payment_orders (username);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  username TEXT REFERENCES users (username) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_username_created_at
  ON audit_logs (username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

CREATE TABLE IF NOT EXISTS llm_response_cache (
  cache_key TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  response_text TEXT NOT NULL,
  usage TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_response_cache_provider
  ON llm_response_cache (provider_id);
