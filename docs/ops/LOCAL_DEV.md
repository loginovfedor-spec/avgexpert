# Локальная тестовая среда (VectorKB)

**PostgreSQL** — удалённый (`DATABASE_URL` в `.env`).  
**Локально** поднимаются embedder и прочие вспомогательные сервисы.

## Компоненты

| Сервис | Где | Порт | Назначение |
|--------|-----|------|------------|
| **TEI bge-m3** | Docker (`local-dev/`) | `8090` | Self-hosted embeddings (§11.1) |
| **TEI bge-reranker-v2-m3** | Docker (`local-dev/`) | `8091` | Cross-encoder rerank expert/sage (§11.2 S7b) |
| **AvgExpert Gateway** | `npm start` | `8200` | API + WebUI (production UI из `webui_dist`) |
| **Vite dev UI** | `npm run dev:web` | `5173` | Только фронт; нужен `npm start` на `8200` (прокси `/api`) |
| **Llama.cpp** | `llama_cpp/start_windows.cmd` | `8201` | Локальный LLM (опционально) |
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
# 1. TEI (первый запуск скачивает модель BAAI/bge-m3, ~5–15 мин)
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

## Порты

- `8090` — TEI (не конфликтует с Envoy LLM proxy на `8080`)
- Prod embedder (`bge_m3.env`) — `83.166.253.250:8080` для VPC
