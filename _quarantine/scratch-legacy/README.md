# Legacy scratch scripts (SQLite era)

Перенесены из `scratch/` после миграции на PostgreSQL (программа D).

| Файл | Причина |
|------|---------|
| `inspect_*.ts`, `restore_categories.ts`, `unblock_admin.ts` | `better-sqlite3` / `data/database.sqlite` |
| `scratch.ts`, `test_token_usage.ts` | импорт удалённого `src/core/sqlite` |
| `scratch_test_*.ts`, `scratch_mock_test.ts`, `scratch_check_models.ts` | одноразовые adapter/mock прогоны; покрыты `tests/` |

Актуальные утилиты остаются в `scratch/` (PG admin, eval reports, ручные provider smoke).
