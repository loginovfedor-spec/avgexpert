# S0 — Подготовка (2 недели)

**Этап:** 0 | **Предшественник:** — | **Следующий:** [S1](./S01-vector-foundation.md)

## Цель

Зафиксировать контракты, флаги, eval baseline, gate для выбора embedder.

## Prereqs

- [`RAG_MIGRATION_PLAN.md` §11](../architecture/RAG_MIGRATION_PLAN.md) — решения уже утверждены
- Репозиторий на `main`, рабочая копия чистая

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S0-1 | §11 зафиксирован в плане | §11.1–§11.6 Approved |
| S0-2 | `compare_rag_models.js` inject-only | Baseline JSON 3 tier LLM |
| S0-3 | Feature flag `RAG_V2_ENABLED` | env + `config.ts` |
| S0-4 | SQLite migration categories | `retrieval_tier`, v024+ |
| S0-5 | Карта категорий | Таблица §7 плана |
| S0-6 | Recall@k eval | ≥30 queries, ≥50 docs; gate §11.3 |
| S0-7 | RU eval-набор | ≥30 query→chunk pairs |

## Ключевые файлы

- `scratch/compare_rag_models.js`
- `src/core/config.ts`, `src/config/env.ts`
- `src/core/migrations/v026_*` (или следующий номер)
- `tests/evals/rag_dataset.json`, `tests/evals/rag.eval.js`

## Тесты

```bash
node scratch/compare_rag_models.js --help
node tests/evals/rag.eval.js
npm run test:unit
```

## Критерий выхода

- [ ] recall@k gate пройден → **записать** `EMBEDDING_*` в `SPRINT_STATE.md`
- [ ] `RAG_V2_ENABLED` в config
- [ ] eval dataset готов

## Handoff → S1

Следующий агент **не стартует**, пока в `SPRINT_STATE.md` заполнены: `EMBEDDING_MODEL`, `EMBEDDING_DIMS`, `EMBEDDING_NAMESPACE`, recall@3 метрики.
