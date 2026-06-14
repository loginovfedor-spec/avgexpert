# Bug List

## Не исправленные баги

## Исправленные баги

### BUG-001: Миграция удаления `users.n_ctx` не подключена к runner

- Статус: Исправлена (2026-06-14)
- Severity: Medium
- Файлы: `src/core/pg/migrate.ts`, `src/core/pg/migrations/010_drop_user_n_ctx.sql`
- Источник: проверка PG-схемы после вопроса пользователя о новой схеме лимитов
- Описание: файл `010_drop_user_n_ctx.sql` существует, но не включен в массив `MIGRATIONS`, поэтому существующая PostgreSQL-база не применяет удаление колонки `users.n_ctx`.
- Fix: миграция `010_drop_user_n_ctx` добавлена в `MIGRATIONS`.

