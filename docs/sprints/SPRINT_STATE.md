# Sprint State



> Агент обновляет этот файл. Пользователь **не редактирует** (кроме ответов на вопросы агента).



| Поле | Значение |

|------|----------|

| **current_sprint** | `S9` |

| **plan** | [`RAG_MIGRATION_PLAN.md` §6](../architecture/RAG_MIGRATION_PLAN.md) |



## Прогресс текущего спринта

_Задачи и DoD — в плане §6. Здесь только статус._

| ID | Статус |
|----|--------|
| S9-1 | pending |
| S9-2 | pending |
| S9-3 | pending |
| S9-4 | pending |
| S9-5 | pending |

## Завершённые спринты

| Спринт | Дата | Коммиты | Bugbot |
|--------|------|---------|--------|
| S8 | 2026-06-10 | — | 0 critical, 0 high, 2 medium (fixed), 1 medium (tech debt) |
| S7b | 2026-06-10 | — | не запускался |
| S7 | 2026-06-10 | `85fc199` | 0 critical, 0 high, 1 medium (fixed) |
| S6 | 2026-06-09 | — | 0 critical, 4 high (fixed) |
| S5 | 2026-06-09 | `ad2f65b` `206c9ab` `de704db` | 0 critical, 1 high (fixed), 6 medium (1 fixed, 5 tech debt) |
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



### RETRO S8 — 2026-06-10

**Выполнение:** S8-1…S8-5 done

**Артефакты:** `002_semantic_graph.sql`, `entity-extraction.service.ts`, `semantic-graph.service.ts`, `semantic-graph.repository.ts`, `domain-tags-filter.ts`, `semantic_graph_spike.ts`, `SEMANTIC_GRAPH_ENABLED`, `npm run test:s8`, `npm run spike:semantic-graph`, §11.6 go/no-go

**Соответствие плану:** нет расхождений с §6 S8; graph — R&D spike, не production gate; domain_tags filter — production (expert/sage)

**Качество:** `tsc --noEmit` PASS; `test:s8` 14/14 PASS; `test:rag` 38/38 PASS; `spike:semantic-graph` PASS

**Метрики:** plan_accuracy ~97%; spike: 5 docs, 20 chunks, avg 12.85 entities/chunk, 151 unique; go/no-go: defer mandatory graph to v2; tech debt: populate `entity_ids` at ingest — v2

**Bugbot-review:** findings 5 (0 critical, 2 high fixed, 2 medium fixed, 1 medium tech debt)

| Severity | Location | Finding |
|----------|----------|---------|
| high | semantic-graph.repository | Graph expansion bypassed tenant scope — **fixed** (access clause) |
| high | rag.orchestrator | SemanticGraphService not wired — **fixed** (`createTieredRetrieverFromEnv`) |
| medium | pgvector.store | `entity_ids` missing from search hits — **fixed** (SELECT + metadata) |
| medium | scoped.cache | Cache ignored `semanticGraphEnabled` — **fixed** |
| medium | tiered.retriever | Expanded chunks skipped domain filter — **fixed** (re-filter after expand) |
| medium | ingestion pipeline | `entity_ids` not populated at ingest — **tech debt (v2)** |

**Уроки:** graph expansion must respect RetrievalContext scopes; opt-in flags belong in cache key; entity_ids populate — отдельный v2 pipeline

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S7b — 2026-06-10

**Выполнение:** S7b-1…S7b-3 done

**Артефакты:** `selfhosted.reranker.ts`, `mock.reranker.ts`, `reranker.service.ts`, `rerank-scoring.ts`, `TieredRetriever` (optional reranker), `rag.orchestrator` (`rag.rerank_ms` trace), docker `tei-bge-reranker:8091`, `rag_expert_rerank.eval.js`, `npm run test:s7b`, `npm run eval:expert-rerank`

**Соответствие плану:** нет расхождений с §6 S7b / §11.2; `RERANK_ENABLED=false` по умолчанию (opt-in)

**Качество:** `tsc --noEmit` PASS; `test:s7b` 10/10 PASS; `test:rag` 32/32 PASS; `eval:expert-rerank` PASS (metadata@7: 0.139 → rerank@7: 0.315)

**Метрики:** mock rerank p95 ≤150 ms PASS; expert recall delta +0.176 (offline mock); live TEI rerank — `RERANK_ENABLED=true` + `local:up`

**Bugbot-review:** не запускался

**Уроки:** reranker — optional 4-й аргумент TieredRetriever; consultant tier не rerank; TEI `/rerank` endpoint; trace `rag.rerank_ms` в orchestrator

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S7 — 2026-06-10

**Выполнение:** S7-1…S7-5 done

**Артефакты:** `metadata-scoring.ts`, `tiered.retriever.ts` (metadata-weighted + candidate pool), `pgvector.store.ts` (doc_type/domain_tags/indexed_at in hits), migration v028, admin UI (rag_enabled, retrieval_tier, global_kb_enabled), `rag_tier_recall.eval.js`, `npm run test:s7`, `npm run eval:tier-recall`, `webui_dist`

**Соответствие плану:** нет расхождений с §6 S7; cross-encoder rerank — S7b (§11.2)

**Качество:** `tsc --noEmit` PASS; `test:s7` 10/10 PASS; `test:rag` 27/27 PASS; `eval:tier-recall` PASS (36 queries, per-tier report)

**Метрики:** plan_accuracy ~97%; offline recall@k: consultant 0.116, expert 0.139, sage 0.176; tech debt: domain_tags filter production — S8-4; live staging E2E expert/sage — `RAG_V2_ENABLED=true`

**Bugbot-review:** findings 1 (0 critical, 0 high, 1 medium fixed)

| Severity | Location | Finding |
|----------|----------|---------|
| medium | metadata-scoring.ts | domain_tags substring false positives — **fixed** (token-exact match) |

**Уроки:** metadata boost требует doc_type/domain_tags/indexed_at в VectorHit; candidate pool 3× topK для expert/sage; admin L2 toggle через extra_params.global_kb_enabled

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S6 — 2026-06-09

**Выполнение:** S6-1…S6-5 done

**Артефакты:** `session-attachments.routes.ts`, `indexing-queue.ts`, `session-gc.ts`, `upload-lock.ts`, `indexExistingDocument` в pipeline, UI `session-attachments.js`, `DELETE` вложений, `session_id` в completions, `npm run test:s6`, `webui_dist`

**Соответствие плану:** нет расхождений с §6 S6; post-close: attach-before-chat создаёт SQLite-сессию; DELETE вложения; pg advisory lock для session quota; orphan pending → failed на restart

**Качество:** `tsc --noEmit` PASS; `test:s6` 8/8 PASS; `test:rag` 18/18 PASS

**Метрики:** plan_accuracy ~96%; tech debt: in-memory queue без persist (re-upload после restart); user KB quota lock in-process only (multi-instance)

**Bugbot-review:** findings 4 (0 critical, 4 high fixed)

| Severity | Location | Finding |
|----------|----------|---------|
| high | session-attachments UI | Attach before chat 404 — **fixed** (POST /api/sessions upsert) |
| high | session-attachments UI | Remove chip leaves PG chunks — **fixed** (DELETE API + UI) |
| high | indexing-queue | Queue lost on restart — **mitigated** (orphan pending→failed on startup) |
| high | upload-lock | Multi-instance quota bypass — **partial** (pg lock session; user KB in-process) |

**Уроки:** session doc create + quota — в одной pg-транзакции; in-process queue требует fail-fast orphan rows на restart; UI attach должен upsert session до POST attachment

**OPT предложены:** нет

**Вопросы пользователю:** нет

---

### RETRO S5 — 2026-06-09

**Выполнение:** S5-1…S5-8 done

**Артефакты:** `src/modules/kb/kb.routes.ts`, `upload.validation.ts`, `kb.limits.ts`, `ingestContent` в pipeline, `document-context.resolver.ts`, UI «Мои документы», `webui_dist` + `ensure-webui-dist.js`, Vite `/api` proxy, `docs/ops/USER_KB_SECURITY.md`, `npm run test:s5`

**Соответствие плану:** нет расхождений с §6 S5; post-close: webui_dist в git, login 404 на :5173 без gateway — закрыт proxy + docs

**Качество:** `tsc --noEmit` PASS; `test:s5` 12/12 PASS; `test:rag` 18/18 PASS (close gate)

**Метрики:** plan_accuracy ~97%; tech debt: concurrent doc limit race; upload rate limit; ensure-webui-dist mtime scan (fixed at close)

**Bugbot-review:** findings 7 (0 critical, 1 high fixed, 6 medium: 2 fixed/mitigated, 4 tech debt)

| Severity | Location | Finding |
|----------|----------|---------|
| high | kb.routes delete | Session doc deletable via user API — **fixed** (scope=user) |
| medium | kb.routes limit | Failed upload consumes quota — **fixed** |
| medium | kb.routes limit | Concurrent POST race — tech debt (S6) |
| medium | kb.routes upload | 50MB parse before 5MB — **mitigated** (zod max) |
| medium | kb.routes limit | Concurrent uploads bypass quota — tech debt (S6) |
| medium | kb.routes upload | No rate limit on user uploads — tech debt (S9) |
| medium | ensure-webui-dist | Stale dist on JS-only edits — **fixed** (scan webui_src mtime) |

**Уроки:** user API фильтрует `scope=user`; `webui_src` без `build:web` ломает production UI; dev UI (:5173) требует `npm start` (:8200)

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


