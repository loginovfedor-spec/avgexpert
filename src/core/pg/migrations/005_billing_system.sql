-- Миграция: 005_billing_system.sql
-- Создание таблиц balance_transactions и exchange_rates
-- Расширение users и payment_orders для работы с USD-балансом

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency TEXT PRIMARY KEY,
  rate NUMERIC(18,8) NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS balance_transactions (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  amount NUMERIC(18,8) NOT NULL,
  type TEXT NOT NULL, -- 'deposit', 'charge', etc.
  reference_type TEXT, -- 'payment_order', 'llm_request', etc.
  reference_id TEXT,
  exchange_rate NUMERIC(18,8),
  amount_original NUMERIC(18,8),
  currency_original TEXT,
  recorded_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bt_username_recorded_at
  ON balance_transactions (username, recorded_at DESC);

-- Расширение таблицы users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS balance_usd NUMERIC(18,8) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS credit_limit_usd NUMERIC(18,8) NOT NULL DEFAULT 0.0;

-- Расширение таблицы payment_orders
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS credited_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8);
