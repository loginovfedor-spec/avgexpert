-- D2: app core schema (users, categories, token_usage_history)
-- Consolidated from SQLite migrations v001–v030 (app tables only)

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  category TEXT,
  expiration_date TEXT,
  system_prompt TEXT,
  email TEXT,
  must_change_password BOOLEAN DEFAULT FALSE,
  token_version INTEGER NOT NULL DEFAULT 0,
  allowed_categories TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  tokens_allocated INTEGER NOT NULL DEFAULT 0,
  tokens_input_used INTEGER NOT NULL DEFAULT 0,
  tokens_output_used INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  input_context_limit INTEGER,
  output_generation_limit INTEGER,
  rag_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  provider TEXT,
  endpoint_url TEXT,
  model_name TEXT,
  api_key TEXT,
  temperature DOUBLE PRECISION,
  top_p DOUBLE PRECISION,
  top_k INTEGER,
  min_p DOUBLE PRECISION,
  repeat_penalty DOUBLE PRECISION,
  max_tokens INTEGER,
  system_prompt TEXT,
  extra_params TEXT,
  routing_mode TEXT NOT NULL DEFAULT 'direct',
  fallback_provider TEXT,
  yandex_folder_id TEXT,
  debug_mode BOOLEAN NOT NULL DEFAULT FALSE,
  complexity DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  suggested_questions TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL DEFAULT 0,
  rag_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  retrieval_tier TEXT NOT NULL DEFAULT 'consultant'
    CHECK (retrieval_tier IN ('consultant', 'expert', 'sage')),
  input_context_default INTEGER NOT NULL DEFAULT 1000000,
  input_context_max INTEGER NOT NULL DEFAULT 1000000
);

CREATE TABLE IF NOT EXISTS token_usage_history (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  tokens_allocated INTEGER NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  recorded_at BIGINT NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_expiration_date ON users (expiration_date);
CREATE INDEX IF NOT EXISTS idx_token_usage_history_username_recorded_at
  ON token_usage_history (username, recorded_at DESC);
