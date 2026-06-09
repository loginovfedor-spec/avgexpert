# Sprint State — RAG v2 Migration

**Обновляется агентом в конце каждого спринта. Следующий агент читает этот файл первым.**

| Поле | Значение |
|------|----------|
| **current_sprint** | `S0` (не начат) |
| **last_completed** | — |
| **branch** | `main` |
| **repo** | https://github.com/loginovfedor-spec/avgexpert |

## Статус спринтов

| Спринт | Статус | Commit(s) | HANDOFF |
|--------|--------|-----------|---------|
| S0 | `pending` | — | — |
| S1 | `pending` | — | — |
| S2 | `pending` | — | — |
| S3 | `pending` | — | — |
| S4 | `pending` | — | — |
| S5 | `pending` | — | — |
| S6 | `pending` | — | — |
| S7 | `pending` | — | — |
| S7b | `pending` | — | — |
| S8 | `pending` | — | — |
| S9 | `pending` | — | — |
| S10 | `pending` | — | — |

## Зафиксированные решения (накопительно)

См. [`RAG_MIGRATION_PLAN.md` §11](../architecture/RAG_MIGRATION_PLAN.md). Дополнения по ходу работы:

| Дата | Спринт | Решение |
|------|--------|---------|
| 2026-06-09 | — | §11.1–§11.6 утверждены (self-hosted embedder, metadata scoring, recall@k gate, re-index books, scoped cache, graph=R&D) |

## Env / namespace (заполняется в S0–S1)

| Параметр | Значение |
|----------|----------|
| `EMBEDDING_PROVIDER` | TBD (после S0-6) |
| `EMBEDDING_MODEL` | TBD |
| `EMBEDDING_DIMS` | TBD |
| `EMBEDDING_NAMESPACE` | TBD |
| `RAG_V2_ENABLED` | `false` (default до S3) |

## Eval baseline (заполняется в S0)

| Метрика | Значение |
|---------|----------|
| recall@3 Yandex baseline | TBD |
| recall@3 self-hosted | TBD |
| eval dataset path | TBD (`tests/evals/` или `scratch/`) |

## Блокеры

| ID | Описание | Спринт | Статус |
|----|----------|--------|--------|
| — | нет | — | — |

## Заметки для следующего агента

_Пока спринты не начаты. Первый агент: откройте чат S0, прочитайте `S00-preparation.md`._
