# S7 — Tiers Expert/Sage (2 недели)

**Этап:** 4 | **Предшественник:** [S6](./S06-session-kb.md) | **Следующий:** [S7b](./S07b-reranker.md) или [S8](./S08-semantic-spike.md)

## Цель

Expert topK=7, Sage topK=12, metadata-weighted scoring (не cross-encoder rerank).

## Prereqs

- [ ] `HANDOFF-06.md`

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S7-1 | Expert metadata-weighted | topK=7 |
| S7-2 | Sage + recency boost | topK=12 |
| S7-3 | Категории Эксперт/Мудрец | admin |
| S7-4 | `global_kb_enabled` per category | |
| S7-5 | Eval 18+ tests | per-tier report |

## Критерий выхода

- [ ] 3 tier измеримая разница topK/latency
- [ ] eval per-tier report

## Handoff → S7b

Передать: baseline expert metrics для сравнения с reranker.
