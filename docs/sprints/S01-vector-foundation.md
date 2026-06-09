# S1 — Vector Foundation (2 недели)

**Этап:** 1 | **Предшественник:** [S0](./S00-preparation.md) | **Следующий:** [S2](./S02-ingestion-reindex.md)

## Цель

Ports + PG schema + self-hosted embedder.

## Prereqs

- [ ] `HANDOFF-00.md` существует
- [ ] `EMBEDDING_*` зафиксированы в `SPRINT_STATE.md` (из S0-6)

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S1-1 | `src/modules/vector/` | ports, types, registry |
| S1-2 | `SelfHostedEmbeddingProvider` | unit tests + mock |
| S1-3 | PG migration `kb_documents`, `kb_chunks` | HNSW, dims из S0 |
| S1-4 | `PgVectorStore` upsert/search/delete | integration test |
| S1-5 | `EmbeddingService` factory | configLoader |
| S1-6 | Prod PG checklist | pgvector ≥0.5 на `83.166.253.250` |

## Ключевые файлы

```
src/modules/vector/
  ports/embedding.provider.ts
  ports/vector.store.ts
  providers/selfhosted.embedding.ts
  stores/pgvector.store.ts
  registry.ts
```

## Тесты

```bash
npm run test:unit
# integration test с local/testcontainers PG
```

## Критерий выхода

- [ ] embed + upsert + search вручную работают
- [ ] dims в PG совпадают с `SPRINT_STATE.md`

## Handoff → S2

Передать: путь к PG migration, пример upsert/search, env-переменные embedder.
