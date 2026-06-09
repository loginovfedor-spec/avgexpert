# S6 — Session KB (2 недели)

**Этап:** 3 | **Предшественник:** [S5](./S05-user-kb.md) | **Следующий:** [S7](./S07-tiers.md)

## Цель

Session attachments + async indexing + GC.

## Prereqs

- [ ] `HANDOFF-05.md`
- [ ] User KB работает

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S6-1 | POST /chat/sessions/:id/attachments | scope=session |
| S6-2 | Session GC worker | delete chunks on session delete |
| S6-3 | UI attach + polling | «индексируется…» |
| S6-4 | Async indexing queue | retry + failed |
| S6-5 | E2E upload→ask→delete | chunks gone |

## Критерий выхода

- [ ] user + session docs на всех consultant providers
- [ ] GC < 1 min (NFR-3)

## Handoff → S7

Передать: GC hook location, queue impl choice, E2E test path.
