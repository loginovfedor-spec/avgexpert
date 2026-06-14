-- Миграция: 006_sprint4_init.sql
-- Обнуление баланса и блокировка не-администраторов при старте новой денежной системы

UPDATE users 
SET balance_usd = 0.0, 
    is_blocked = TRUE 
WHERE is_admin = FALSE;
