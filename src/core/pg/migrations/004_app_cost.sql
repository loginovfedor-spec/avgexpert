-- Миграция: 004_app_cost.sql
-- Создание таблицы логирования затрат на запросы

CREATE TABLE IF NOT EXISTS request_cost_log (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  username TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  adapter_type TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(18,8) NOT NULL DEFAULT 0,
  rate_input_per_token NUMERIC(18,12) NOT NULL DEFAULT 0,
  rate_cached_input_per_token NUMERIC(18,12) NOT NULL DEFAULT 0,
  rate_output_per_token NUMERIC(18,12) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
  cost_mode TEXT NOT NULL DEFAULT 'standard',
  compute_seconds NUMERIC(18,6) NOT NULL DEFAULT 0,
  rate_usd_per_hour NUMERIC(18,8) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'chat',
  category TEXT,
  created_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcl_request_provider
  ON request_cost_log (request_id, provider_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rcl_username_created
  ON request_cost_log (username, created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_rcl_provider_created
  ON request_cost_log (provider_id, created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_rcl_adapter_type
  ON request_cost_log (adapter_type);

-- Расширение таблицы users для накопления расхода в USD
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cost_usd_used NUMERIC(18,8) NOT NULL DEFAULT 0;
