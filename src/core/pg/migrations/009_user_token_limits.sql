ALTER TABLE users
  ADD COLUMN IF NOT EXISTS input_context_limit INTEGER,
  ADD COLUMN IF NOT EXISTS output_generation_limit INTEGER,
  DROP COLUMN IF EXISTS input_context_credits,
  DROP COLUMN IF EXISTS output_generation_credits;
