-- Миграция: 007_request_id_text.sql
-- Изменение типа колонки request_id с UUID на TEXT

ALTER TABLE request_cost_log ALTER COLUMN request_id TYPE TEXT;
