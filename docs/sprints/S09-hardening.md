# S9 — Hardening (2 недели)

**Этап:** 5 | **Предшественник:** [S8](./S08-semantic-spike.md) | **Следующий:** [S10](./S10-prod-cutover.md)

## Цель

Load test, security regression, runbook, staging default RAG_V2.

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S9-1 | Remove yandex_file_search embed/search | |
| S9-2 | RAG_V2_ENABLED default staging | |
| S9-3 | Load test retrieval | p95 vs NFR-1 |
| S9-4 | Security regression | isolation + upload |
| S9-5 | Runbook | re-index, rollback |

## Критерий выхода

- [ ] p95 report
- [ ] runbook в `docs/`

## Handoff → S10

Передать: load test results, rollback steps verified.
