# S5 — User KB (2 недели)

**Этап:** 3 | **Предшественник:** [S4](./S04-llm-cutover.md) | **Следующий:** [S6](./S06-session-kb.md)

## Цель

Persistent user documents (scope=user) + security + isolation.

## Prereqs

- [ ] `HANDOFF-04.md`
- [ ] RAG_V2 consultant stable

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S5-1 | POST /user/documents | auth + limits |
| S5-2 | list/delete user docs | |
| S5-3 | `DocumentContextResolver` | unit tests |
| S5-4 | Retriever owner_user_id filter | isolation test |
| S5-5 | UI «Мои документы» | upload + status |
| S5-6 | Upload validation | size, mime, filename |
| S5-7 | SSRF + PDF policy | checklist |
| S5-8 | Tenant isolation E2E | user A/B |

## Тесты

```bash
npm run test:unit
# E2E isolation
```

## Критерий выхода

- [ ] user docs upload → index → retrieve → только owner видит
- [ ] S5-8 automated

## Handoff → S6

Передать: API endpoints, UI entry points, isolation test commands.
