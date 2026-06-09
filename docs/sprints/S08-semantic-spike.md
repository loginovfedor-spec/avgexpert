# S8 — Semantic Graph R&D Spike (2 недели)

**Этап:** 4 | **Не production gate** | **Следующий:** [S9](./S09-hardening.md)

## Цель

Прототип entity graph; sage v1 **без** обязательного графа (§11.6).

## Prereqs

- [ ] S7 (S7b optional) done

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S8-1 | PG schema semantic nodes/edges | migration only |
| S8-2 | Entity extraction spike 10 docs | quality report |
| S8-3 | `SemanticGraphService.expand` prototype | opt-in flag |
| S8-4 | Expert domain_tags filter | production |
| S8-5 | Go/no-go graph v2 | decision doc |

## Критерий выхода

- [ ] sage v1 = topK=12 без графа
- [ ] S8-5 decision записан в `SPRINT_STATE.md`

## Handoff → S9

Передать: go/no-go, prototype flag name.
