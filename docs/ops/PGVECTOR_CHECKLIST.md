# PGVECTOR_CHECKLIST — S1-6

Чеклист проверки production PostgreSQL для VectorKB (RAG v2).

## Целевой хост

- Prod PG: `83.166.253.250`
- `DATABASE_URL` — в корневом `.env` **или** в `src/modules/providers/config/*.env` (как у `yandex_file_search.env`); приоритет у `process.env`

## Автоматический smoke

```bash
cd avgexpert
DATABASE_URL=postgresql://... npm run kb:pg:smoke
# опционально сверка хоста:
DATABASE_URL=postgresql://... npm run kb:pg:smoke -- --host=83.166.253.250
```

Скрипт проверяет:

1. Подключение к PostgreSQL
2. Установлено расширение `vector`
3. Версия `pgvector` ≥ 0.5 (HNSW)
4. Миграция `001_kb_schema` (таблицы `kb_documents`, `kb_chunks`)
5. Индекс `kb_chunks_embedding_hnsw_idx`

## Ручной чеклист

| # | Проверка | Команда / критерий |
|---|----------|-------------------|
| 1 | Extension | `SELECT extversion FROM pg_extension WHERE extname = 'vector';` |
| 2 | Версия ≥ 0.5 | `extversion >= 0.5.0` |
| 3 | Таблицы | `\dt kb_*` → `kb_documents`, `kb_chunks` |
| 4 | HNSW | `\d kb_chunks` → index `kb_chunks_embedding_hnsw_idx` |
| 5 | Dims | `embedding vector(N)` где `N = EMBEDDING_DIMS` (default 1024) |
| 6 | Pool limits | `VECTOR_PG_MAX`, idle/connection timeouts при необходимости |

## Миграция

```bash
EMBEDDING_DIMS=1024 DATABASE_URL=... npm run kb:pg:migrate
```

**Важно:** размерность `vector(N)` фиксируется при первой миграции. Смена `EMBEDDING_DIMS` требует re-index / нового namespace.
