# Quarantine — кандидаты на удаление

Файлы, не импортируемые из `server.ts` / `src/` при runtime.
Перенесены сюда вместо удаления: можно восстановить или удалить после ревью.

| Путь | Причина |
|------|---------|
| `legacy-providers/` | Дубликат `src/modules/providers/`, нигде не импортируется |
| `legacy-config/env.ts` | Урезанный дубликат `src/core/config.ts` |
| `scratch-legacy/` | SQLite-era scratch-скрипты после миграции на PG (см. README внутри) |

Typecheck:
- `legacy-providers/`, `legacy-config/` — `tsconfig.quarantine.json` (CI + `npm run typecheck`)
- `scratch-legacy/` — не компилируется (SQLite-era, см. README внутри)

Основной `tsconfig.json` не включает `_quarantine` в emit (`exclude`).
