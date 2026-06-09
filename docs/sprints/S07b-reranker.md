# S7b — Reranker follow-up (1–2 недели, опционально)

**Этап:** 4 | **Предшественник:** [S7](./S07-tiers.md) | **Следующий:** [S8](./S08-semantic-spike.md)

## Цель

Self-hosted `bge-reranker-v2-m3` для expert/sage (§11.2).

## Prereqs

- [ ] S7 completed, baseline eval есть

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S7b-1 | bge-reranker integration | expert/sage only |
| S7b-2 | Eval metadata vs reranker | per-tier report |
| S7b-3 | Latency p95 ≤ 150ms rerank | trace report |

## Критерий выхода

- [ ] go/no-go reranker в production tier

## Handoff → S8

Передать: reranker on/off flag, latency numbers.
