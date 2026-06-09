# Sprint State

> Агент обновляет этот файл. Пользователь **не редактирует** (кроме ответов на вопросы агента).

| Поле | Значение |
|------|----------|
| **current_sprint** | `S1` |
| **plan** | [`RAG_MIGRATION_PLAN.md` §6](../architecture/RAG_MIGRATION_PLAN.md) |

## Прогресс текущего спринта

_Задачи и DoD — в плане §6. Здесь только статус._

| ID | Статус |
|----|--------|
| S1-1 | done |
| S1-2 | done |
| S1-3 | done |
| S1-4 | done |
| S1-5 | done |
| S1-6 | done |

## Завершённые спринты

| Спринт | Дата | Коммиты | Bugbot |
|--------|------|---------|--------|
| S0 | 2026-06-09 | — | 0 critical, 1 high (fixed), 2 medium (fixed) |

## Параметры (заполняет агент по ходу работы)

| Параметр | Значение |
|----------|----------|
| `EMBEDDING_PROVIDER` | `self-hosted` (default; gate S0-6 pending live API) |
| `EMBEDDING_MODEL` | `bge-m3` (default) |
| `EMBEDDING_DIMS` | `1024` (default; фиксация после S0-6 gate) |
| `EMBEDDING_NAMESPACE` | `bge-m3-v1` (default; фиксация после S0-6 gate) |
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

---

### RETRO S1 — 2026-06-09

**Выполнение:** S1-1…S1-6 done
**Артефакты:** `src/modules/vector/` (ports, providers, stores, pg migrate), `scripts/kb_pg_migrate.ts`, `scripts/pgvector_smoke.ts`, `docs/ops/PGVECTOR_CHECKLIST.md`, env/config, `npm run test:vector`
**Соответствие плану:** нет расхождений с §6 S1; `EMBEDDING_*` defaults до gate S0-6 live API
**Качество:** `tsc --noEmit` PASS; `test:vector` 13/13 PASS; `kb:pg:smoke` PASS на 83.166.253.250 (pgvector 0.8.2); `test:pr` 64/66 (express.json 2mb — pre-existing)
**Метрики:** plan_accuracy ~98%; tech debt: ONNX runtime in-process — HTTP endpoint only

**Bugbot-review:** diff недоступен (git); ручная проверка: guard на delete без фильтра
**Уроки:** pg импорт только через dynamic import в integration test; dims фиксируются при первой миграции
**OPT предложены:** нет
**Вопросы пользователю:** нет
