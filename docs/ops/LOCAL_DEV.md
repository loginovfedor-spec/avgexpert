# Локальная тестовая среда (VectorKB)

**PostgreSQL** — удалённый (`DATABASE_URL` в `.env`).  
**Локально** поднимаются embedder и прочие вспомогательные сервисы.

## Компоненты

| Сервис | Где | Порт | Назначение |
|--------|-----|------|------------|
| **TEI bge-m3** | Docker (`local-dev/`) | `8090` | Self-hosted embeddings (§11.1) |
| **TEI bge-reranker-v2-m3** | Docker (`local-dev/`) | `8091` | Cross-encoder rerank expert/sage (§11.2 S7b) |
| **Llama.cpp (Qwen2.5-7B)** | Docker (`local-dev/`) | `8201` | Локальный LLM для «Консультант (Local)» |
| **AvgExpert Gateway** | `npm start` | `8200` | API + WebUI (production UI из `webui_dist`) |
| **Vite dev UI** | `npm run dev:web` | `5173` | Только фронт; нужен `npm start` на `8200` (прокси `/api`) |
| **Llama.cpp (legacy)** | `llama_cpp/start_windows.cmd` | `8201` | Нативный Windows-бинарник (если Docker не используется) |
| **PostgreSQL** | удалённый | `5432` | VectorKB + cache |

Конфиг embedder для локали: `VECTOR_EMBEDDING_CONFIG=bge_m3.local` → `vector/config/bge_m3.local.env`.

Конфиг reranker: `VECTOR_RERANKER_CONFIG=bge_reranker_v2_m3.local` → `vector/config/bge_reranker_v2_m3.local.env`.  
Включение: `RERANK_ENABLED=true` (по умолчанию `false`; для тестов без TEI — `RERANK_MOCK=true`).

## Быстрый старт (Windows)

```cmd
cd avgexpert
local-dev\start_windows.cmd
```

Или по шагам:

```bash
# 1. TEI + Llama.cpp (первый запуск: bge-m3 ~5–15 мин, Qwen2.5-7B Q4 ~4.7 GB)
npm run local:up

# 2. Проверка embedder
npm run local:smoke

# 3. Gateway
npm start
```

Остановка TEI:

```bash
npm run local:down
```

## Переменные (.env)

```env
VECTOR_EMBEDDING_CONFIG=bge_m3.local
EMBEDDING_MOCK=false
# DATABASE_URL — удалённый PG, не менять для local dev
```

## Проверки

```bash
npm run local:status
npm run embedding:smoke
npm run kb:pg:smoke
```

## Llama.cpp (локальный Консультант)

- Docker-сервис `llama-cpp` в `local-dev/docker-compose.yml`
- Модель: `Qwen2.5-7B-Instruct-Q4_K_M.gguf` (скачивается в `local-dev/data/llama/` при первом старте)
- API: `http://127.0.0.1:8201/v1` (`LLAMACPP_URL` в `.env`)
- Категория после миграции v030: **Консультант (Local)** — `provider=llamacpp`, `retrieval_tier=consultant`, RAG включён

```env
LLAMACPP_URL=http://127.0.0.1:8201/v1
LLAMACPP_DEFAULT_MODEL=qwen2.5-7b-instruct
RAG_V2_ENABLED=true
# Глобальный таймаут 60s мало для CPU 7B — для llamacpp действует PROVIDER_TIMEOUT_MS=300000 (5 мин)
```

Первый ответ после большого RAG-контекста на CPU может занимать **1–3 минуты** — это нормально. Если видите `Provider timeout`, проверьте `PROVIDER_TIMEOUT_MS` в `llamacpp.env`.

Smoke (embedding + chat completion):

```bash
npm run local:smoke
```

## Порты

- `8090` — TEI (не конфликтует с Envoy LLM proxy на `8080`)
- `8201` — Llama.cpp OpenAI API (`/v1/chat/completions`)
- Prod embedder (`bge_m3.env`) — `83.166.253.250:8080` для VPC
