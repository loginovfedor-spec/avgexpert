# Scratch — ручные утилиты и отчёты

Не входят в CI. Legacy SQLite-скрипты перенесены в `_quarantine/scratch-legacy/`.

| Скрипт | Назначение |
|--------|------------|
| `create_admin.ts`, `reset_admin.ts` | PG seed / сброс admin |
| `sync_categories.ts` | синхронизация категорий из `providers.config` |
| `compare_embeddings.ts` | pairwise/margin бенчмарк эмбеддеров |
| `verify_fix.ts`, `verify_dashboard.ts`, `test_mcp_chat.ts` | ручной smoke API |
| `test_*` (grok, gemini, ssrf, …) | provider/security smoke |
| `*.json` | артефакты eval/bench (`bench:rag-tier`, `eval:recall-at-k`) |

Запуск: `tsx scratch/<script>.ts`
