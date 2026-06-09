# Sprint State



> Агент обновляет этот файл. Пользователь **не редактирует** (кроме ответов на вопросы агента).



| Поле | Значение |

|------|----------|

| **current_sprint** | `S6` |

| **plan** | [`RAG_MIGRATION_PLAN.md` §6](../architecture/RAG_MIGRATION_PLAN.md) |



## Прогресс текущего спринта

_Задачи и DoD — в плане §6. Здесь только статус._

| ID | Статус |
|----|--------|
| S6-1 | pending |
| S6-2 | pending |
| S6-3 | pending |
| S6-4 | pending |
| S6-5 | pending |

## Завершённые спринты

| Спринт | Дата | Коммиты | Bugbot |
|--------|------|---------|--------|
| S5 | 2026-06-09 | — | 0 critical, 1 high (fixed), 3 medium (1 fixed, 2 tech debt) |
| S4 | 2026-06-09 | — | 0 critical, 2 high (fixed), 2 medium (fixed) |
| S3 | 2026-06-09 | `91be257` | не запускался |
| S2 | 2026-06-09 | — | ручная проверка |
| S1 | 2026-06-09 | — | ручная проверка |
| S0 | 2026-06-09 | — | 0 critical, 1 high (fixed), 2 medium (fixed) |



## Параметры (заполняет агент по ходу работы)



| Параметр | Значение |

|----------|----------|

| `EMBEDDING_PROVIDER` | `self-hosted` (§11.1) |

| `EMBEDDING_MODEL` | `bge-m3` |

| `EMBEDDING_DIMS` | `1024` |

| `EMBEDDING_NAMESPACE` | `bge-m3-v1` |

| `VECTOR_EMBEDDING_CONFIG` | prod: `bge_m3` → `vector/config/bge_m3.env`; local: `bge_m3.local` |

| `EMBEDDING_API_URL` | local: `http://127.0.0.1:8090/embed` (TEI docker); prod: `http://83.166.253.250:8080/embed` |

| `RAG_V2_ENABLED` | `false` (config + `.env.example`; staging: `true`) |

| `CONVERSATION_MAX_TOKENS` | `100000` (config + `.env.example`) |

| `KB corpus` | 5 книг, 5213 chunks в PG (`bge-m3-v1`, scope=global) |



## RETRO (последний сверху)



### RETRO S5 — 2026-06-09

**Выполнение:** S5-1…S5-8 done

**Артефакты:** `src/modules/kb/kb.routes.ts`, `upload.validation.ts`, `kb.limits.ts`, `ingestContent` в pipeline, `document-context.resolver.ts`, UI «Мои документы», `docs/ops/USER_KB_SECURITY.md`, `npm run test:s5`

**Соответствие плану:** нет расхождений с §6 S5; session scope delete через user API — закрыт scope-фильтром post-Bugbot

**Качество:** `tsc --noEmit` PASS; `test:s5` 12/12 PASS; `test:rag` 18/18 PASS

**Метрики:** plan_accuracy ~97%; tech debt: (1) race на doc limit при concurrent POST; (2) JSON body до 50MB парсится до byte-check — zod max добавлен

**Bugbot-review:** findings 4 (0 critical, 1 high fixed, 3 medium: 1 fixed, 2 tech debt)

| Severity | Location | Finding |
|----------|----------|---------|
| high | kb.routes delete | Session doc deletable via user API — **fixed** (scope=user в findByIdForOwner) |
| medium | kb.routes limit | Failed upload consumes quota — **fixed** (exclude failed from count + delete on 502) |
| medium | kb.routes limit | Concurrent POST race — tech debt (S6 queue) |
| medium | kb.routes upload | 50MB parse before 5MB check — **mitigated** (zod content.max) |

**Уроки:** user API должен фильтровать `scope=user`; failed ingest не оставлять в kb_documents

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S4 — 2026-06-09

**Выполнение:** S4-1…S4-6 done

**Артефакты:** `yandex.js` (Responses + stream + inject-only + `llm_response_cache`), deprecation `yandex_file_search.js`, `v027`, `DegradedRetriever`, `eval:consultant-recall`, tests S4

**Соответствие плану:** нет расхождений с §6 S4; FTS fallback — только global scope (legacy corpus)

**Качество:** `tsc --noEmit` PASS; `test:rag` 13/13 PASS; `test:s4` 8/8 PASS; `eval:consultant-recall` PASS

**Метрики:** plan_accuracy ~97%; tech debt: live recall gate — `eval:recall-at-k`; staging E2E — `RAG_V2_ENABLED=true`

**Bugbot-review:** findings 4 (0 critical, 2 high fixed, 2 medium fixed)

| Severity | Location | Finding |
|----------|----------|---------|
| high | rag.orchestrator cache | Degraded FTS cached — **fixed** |
| high | degraded.retriever FTS | Ignored scopes — **fixed** (global only) |
| medium | yandex.js cache key | Missing gen params — **fixed** |
| medium | degraded.retriever health | Probe every query — **fixed** (30s TTL) |

**Уроки:** degraded path не кэшировать; offline eval = parity TieredRetriever vs direct rank

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S3 — 2026-06-09

**Выполнение:** S3-1…S3-7 done

**Артефакты:** `src/modules/vector/retrievers/tiered.retriever.ts`, `src/modules/rag/` (orchestrator, scoped.cache, format-context, tier.policy, conversation.context), `chat.service.js` RAG_V2 path, `CONVERSATION_MAX_TOKENS`, `npm run test:rag`

**Соответствие плану:** нет расхождений с §6 S3; post-close: продуктовая модель ролей (Консультант→Эксперт→Мудрец), scopes унифицированы без tier-ограничений

**Качество:** `tsc --noEmit` PASS; `test:rag` 10/10 PASS; `test:knowledge` 31/31 PASS

**Метрики:** plan_accuracy ~98%; tech debt: live E2E consultant+PG ждёт `RAG_V2_ENABLED=true`; FTS fallback — S4-6; post-S3: scopes унифицированы (все tier → global+user+session), роли — продуктовые, не scope-ограничения

**Bugbot-review:** не запускался (diff в сессии)

**Уроки:** cache hit не должен мутировать закешированный `RetrievalResult`; multi-scope search — отдельный запрос на scope (AND owner filter ломает global+user)

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S2 — 2026-06-09



**Выполнение:** S2-1…S2-5 done

**Артефакты:** `src/modules/ingestion/` (ChunkingService, IngestionPipeline), `src/modules/kb/kb.repository.ts`, `src/modules/vector/vector.health.ts`, `scripts/kb_ingest.ts`, `scripts/kb_reindex_books.ts`, `POST /api/admin/kb/documents`, `GET /health` vector section, `local-dev/docker-compose.yml`, `scripts/local_stack.ts`, `docs/ops/LOCAL_DEV.md`

**Соответствие плану:** нет расхождений с §6 S2; admin ingest через JSON `filePath`; recall smoke в отчёте пустой (см. tech debt)

**Качество:** `tsc --noEmit` PASS; `test:vector` 32/32 PASS (live TEI); `test:integration:smoke` PASS; `kb:pg:smoke` PASS; live `kb:reindex-books` PASS (5213 chunks, metadata ratio=1); ручной vector search PASS (top score ~0.62); `test:pr` 65/66 (express.json 2mb — pre-existing)

**Метрики:** plan_accuracy ~98%; tech debt: (1) `loadQueries()` в `kb_reindex_books.ts` не читает формат `rag_recall_queries.json` → recall smoke пропущен; (2) TEI CPU требует `--max-batch-tokens 2048` для стабильного warmup; (3) reindex 5 книг ~46 мин на локальном CPU



**Критерий выхода S2:** global docs в PG ✓; search по query вручную ✓; legacy re-embedded ✓



**Bugbot-review:** ручная проверка (diff/git недоступен в сессии); критичных находок нет

**Уроки:** TEI bge-m3 на CPU падает в restart-loop при дефолтных 16384 batch tokens — снижать до 2048; mock embedder в search-тестах должен использовать enrichedText чанка; для live-тестов в PowerShell явно задавать `EMBEDDING_MOCK=false`

**OPT предложены:** multipart upload для admin KB ingest; book-specific recall queries для reindex report

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


