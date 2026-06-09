# S3 — RAG Integration (2 недели)

**Этап:** 2 | **Предшественник:** [S2](./S02-ingestion-reindex.md) | **Следующий:** [S4](./S04-llm-cutover.md)

## Цель

Retriever в chat path; feature flag; scoped cache (§11.5).

## Prereqs

- [ ] `HANDOFF-02.md`
- [ ] Индекс global KB заполнен

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S3-1 | `TieredRetriever` consultant | topK=3, scopes |
| S3-2 | `RagOrchestrator.resolve()` | skip native RAG |
| S3-3 | `chat.service` RAG_V2 path | feature flag |
| S3-4 | `formatContext()` unified | `_retrieval` compat |
| S3-5 | Trace events | embed_ms, search_ms, cache_hit |
| S3-6 | **Scoped cache** | hash(query+namespace+tier+scopes+userId+sessionId) |
| S3-7 | L1 truncate policy | max_tokens config |

## Ключевые файлы

```
src/modules/rag/rag.orchestrator.ts
src/modules/vector/retrievers/tiered.retriever.ts
src/modules/chat/chat.service.js
src/modules/knowledge/knowledge.cache.ts  → заменить pattern
```

## Тесты

```bash
npm run test:unit
# unit: cache isolation user A ≠ user B
```

## Критерий выхода

- [ ] RAG_V2=true → retrieval + inject в staging
- [ ] S3-6 isolation test green

## Handoff → S4

Передать: как включить `RAG_V2_ENABLED`, пример trace output, known gaps для LLM adapters.
