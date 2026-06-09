# S10 — Prod Cutover (2 недели)

**Этап:** 5 | **Предшественник:** [S9](./S09-hardening.md) | **Следующий:** —

## Цель

Production RAG v2; legacy path off.

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S10-1 | Prod cutover + rollback plan | |
| S10-2 | SQLite FTS fallback only | optional off |
| S10-3 | Remove GROK_COLLECTION_IDS RAG path | |
| S10-4 | Dashboard metrics | rag latency |
| S10-5 | Retro + §11 update | |

## Критерий выхода

- [ ] prod на RAG v2
- [ ] Definition of Done §9 плана — все пункты

## Финальный handoff

Обновить `SPRINT_STATE.md`: all sprints `completed`, архивировать sprint docs при необходимости.
