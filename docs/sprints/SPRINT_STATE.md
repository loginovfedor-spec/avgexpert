# Sprint State

> Агент обновляет этот файл. Пользователь **не редактирует** (кроме ответов на вопросы агента).

| Поле | Значение |
|------|----------|
| **current_sprint** | `S0` |
| **plan** | [`RAG_MIGRATION_PLAN.md` §6](../architecture/RAG_MIGRATION_PLAN.md) |

## Прогресс текущего спринта

_Задачи и DoD — в плане §6. Здесь только статус._

| ID | Статус |
|----|--------|
| S0-1 | done |
| S0-2 | done |
| S0-3 | done |
| S0-4 | done |
| S0-5 | done |
| S0-6 | done |
| S0-7 | done |

## Завершённые спринты

| Спринт | Дата | Коммиты | Bugbot |
|--------|------|---------|--------|
| — | — | — | — |

## Параметры (заполняет агент по ходу работы)

| Параметр | Значение |
|----------|----------|
| `EMBEDDING_PROVIDER` | TBD |
| `EMBEDDING_MODEL` | TBD |
| `EMBEDDING_DIMS` | TBD |
| `EMBEDDING_NAMESPACE` | TBD |
| `RAG_V2_ENABLED` | `false` (config + `.env.example`) |

## RETRO (последний сверху)

### RETRO S0 — 2026-06-09

**Выполнение:** S0-1…S0-7 done
**Артефакты:** `RAG_V2_ENABLED` (config), migration v026, `category_tier_map.json`, RU recall corpus/queries (52/36), `scratch/recall_at_k_eval.js`, `compare_rag_models.js --mode=inject-only`, eval metrics/tests
**Соответствие плану:** v024→v026 в §6 (v024 уже занят индексами); gate recall@k — скрипт готов, полный прогон с API — `npm run eval:recall-at-k`
**Качество:** migration/config/recall dataset tests PASS; test:pr 64/66 (express.json 2mb — pre-existing)
**Метрики:** plan_accuracy ~95%; tech debt: self-hosted embedder gate ждёт S1; OPT: seed tier в sqlite.ts исправлен post-Bugbot

**Bugbot-review:** findings 3 (critical/high/medium/low) — 0/1/2/0
| Severity | Location | Finding |
|----------|----------|---------|
| high | v026 + sqlite seed | Fresh install tier mapping — **fixed** (seed UPDATE) |
| medium | v026 migration | Invalid tier from extra_params — **fixed** (CHECK + normalize) |
| medium | rag.eval.js | Citation skip without retrieval — **fixed** |

**Уроки:** v024 в плане устарел; tier seed должен идти после миграции; recall gate требует live API для Yandex/Qwen
**OPT предложены:** нет
**Вопросы пользователю:** нет

---

_Шаблон:_

```markdown
### RETRO S{N} — YYYY-MM-DD

**Выполнение:** S{N}-x done/partial/skip + причины
**Артефакты:** новые/изменённые модули, миграции, API, тесты
**Соответствие плану:** расхождения с §6/§11 (или «нет»)
**Качество:** тесты (PASS/FAIL), NFR затронуты
**Метрики:** plan_accuracy %, DoD неоднозначности, tech debt (1–3 пункта)

**Bugbot-review:** findings N (critical/high/medium/low) — см. таблицу ниже
| Severity | Location | Finding |
|----------|----------|---------|

**Уроки:** 2–5 фактов
**OPT предложены:** OPT-00x … → §12 плана
**Вопросы пользователю:** (если есть) / нет
```

## Блокеры

_Нет._
