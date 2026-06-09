# S4 — LLM Cutover + Degraded (2 недели)

**Этап:** 2 | **Предшественник:** [S3](./S03-rag-integration.md) | **Следующий:** [S5](./S05-user-kb.md)

## Цель

Консультант на RAG_V2 staging; 3 LLM inject-only; degraded FTS fallback.

## Prereqs

- [ ] `HANDOFF-03.md`
- [ ] TieredRetriever consultant работает

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S4-1 | `yandex.js` inject-only | без PG/embed |
| S4-2 | Deprecation `yandex_file_search.js` | log warning |
| S4-3 | Консультант 3 providers | admin configs |
| S4-4 | Eval recall@3 ≥ baseline | S0-7 набор |
| S4-5 | `llm_response_cache` unified | yandex cache ported |
| S4-6 | Degraded → SQLite FTS | health-gated |

## Тесты

```bash
node tests/evals/rag.eval.js
npm run test:unit
```

## Критерий выхода

- [ ] Консультант staging: Yandex/OpenAI/Grok + один VectorKB
- [ ] degraded path проверен

## Handoff → S5

Передать: staging config, eval report, список категорий с `retrieval_tier`.
