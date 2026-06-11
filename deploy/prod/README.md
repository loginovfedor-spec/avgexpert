# Production на Tesla L4 — vGPU-8-16-L4-8Q

| Параметр | Значение |
|----------|----------|
| GPU | NVIDIA Tesla L4 |
| vCPU | 8 |
| RAM | 16 GB |
| VRAM | **8192 MB (8 GB)** |

Полная установка **AvgExpert** на один GPU-сервер с **жёстким лимитом 8 GB VRAM**.

## Что поднимается в Docker

| Сервис | Контейнер | Назначение |
|--------|-----------|------------|
| **postgres** | avgexpert-pg | PostgreSQL **18** + pgvector, `ru_RU.UTF-8` (ADR-1) |
| **tei-bge-m3** | avgexpert-tei-embed | Embeddings на GPU (~2.5 GB VRAM) |
| **tei-bge-reranker** | avgexpert-tei-rerank | Reranker на CPU (0 VRAM) |
| **llama-cpp** | avgexpert-llama | Qwen2.5-7B Q4 **гибрид** (24 слоя GPU) |
| **envoy** | avgexpert-envoy | Egress-proxy к OpenAI / DeepSeek / Grok |
| **app** | avgexpert-gateway | Node.js API + WebUI |
| **nginx** | avgexpert-nginx | HTTPS/HTTP для браузера |

## Требования к серверу

- Ubuntu 22.04 / 24.04 (или аналог)
- Docker 24+ и Docker Compose v2
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- Драйвер NVIDIA + `nvidia-smi`
- Диск: **≥ 80 GB** (модели ~15 GB + PG + логи)
- **Обязательно swap 8 GB** при 16 GB RAM (Llama offload на CPU)

```bash
sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## npm-скрипты (из корня `avgexpert/`)

| Команда | Назначение |
|---------|------------|
| `npm run prod:up` | `docker compose` up (PG 18, TEI, Llama, app, nginx) |
| `npm run prod:down` | Остановить стек |
| `npm run prod:ps` | Статус контейнеров |
| `npm run prod:logs` | Логи compose |
| `npm run prod:post-deploy` | Health + `kb:pg:smoke` после деплоя |
| `npm run prod:migrate-rag` | Перенос RAG с удалённого PG 18 → локальный |
| `npm run prod:migrate-rag:dry` | Dry-run проверки источника |
| `npm run prod:pg-backup` | `pg_dump -Fc` локального PG 18 |

**Разработка на ноутбуке** (app локально, PG/TEI/Llama на pilot): [`deploy/dev/DEV_REMOTE.md`](../dev/DEV_REMOTE.md).

## Развёртывание по SSH с вашего ПК

Полный чеклист: **[SSH_DEPLOY.md](SSH_DEPLOY.md)**

```bash
# На ПК (Git Bash / WSL)
cd avgexpert
cp deploy/prod/ssh-deploy.env.example deploy/prod/ssh-deploy.env
# укажите SERVER=user@IP и GIT_REPO

bash deploy/prod/scripts/ssh-deploy.sh install
```

## Быстрая установка (на сервере)

```bash
# 1. Клонировать репозиторий на сервер
git clone <repo-url> /opt/avgexpert
cd /opt/avgexpert/avgexpert

# 2. Автоустановка (Docker, GPU runtime, compose up)
sudo bash deploy/prod/install.sh

# 3. Задать пароль админа и домен
nano deploy/prod/.env
#   AVGEXPERT_ADMIN_PASSWORD=...
#   PUBLIC_DOMAIN=ai.example.com
#   PUBLIC_BASE_URL=https://ai.example.com
#   AVGEXPERT_ALLOWED_ORIGINS=https://ai.example.com

# 4. API-ключи провайдеров
nano deploy/prod/providers/openai_gpt4_1.env
#   OPENAI_URL=http://envoy:8080/openai/v1  (уже в example)
#   OPENAI_API_KEY=sk-...

# 5. Перезапуск после правок .env
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d

# 6. После готовности TEI (см. logs)
bash deploy/prod/scripts/post-deploy.sh
```

Первый запуск: скачивание **bge-m3**, **reranker**, **Qwen2.5-7B** — **30–90 минут**.

```bash
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml logs -f tei-bge-m3 llama-cpp
```

## HTTPS (Let's Encrypt)

```bash
# Временно остановите nginx если мешает standalone certbot
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml stop nginx

apt install -y certbot
certbot certonly --standalone -d ai.example.com

# SSL nginx config
cp deploy/prod/nginx/conf.d/ssl.conf.example deploy/prod/nginx/conf.d/ssl.conf
sed -i 's/YOUR_DOMAIN/ai.example.com/g' deploy/prod/nginx/conf.d/ssl.conf

docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d nginx
```

## Проверки

```bash
# PG 18 + pgvector + ru_RU.UTF-8
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml exec postgres \
  psql -U avg -d avgexpert -c "SELECT version(); SELECT datcollate FROM pg_database WHERE datname = current_database();"
npm run kb:pg:smoke   # с ноутбука: DATABASE_URL через SSH-туннель (см. DEV_REMOTE.md)

curl -s http://127.0.0.1:8200/health | jq .
curl -s http://127.0.0.1:8200/ready
curl -s http://127.0.0.1:8090/health   # TEI
curl -s http://127.0.0.1:8201/health   # Llama
```

В браузере: `https://ai.example.com` → логин `admin` + пароль из `.env`.

## Управление

```bash
cd /opt/avgexpert/avgexpert

# Статус
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml ps

# Логи
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml logs -f app

# Обновление версии
git pull
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d --build app
bash deploy/prod/scripts/post-deploy.sh

# Остановка
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml down
```

## Бюджет VRAM (8192 MB) — по умолчанию

| Компонент | GPU VRAM | RAM |
|-----------|----------|-----|
| TEI bge-m3 | ~2.5 GB | ~1 GB |
| Llama 7B Q4 (`ngl=24`, `ctx=4096`) | ~4 GB | ~3 GB (слои на CPU) |
| Reranker | 0 | ~2 GB |
| PostgreSQL + app + nginx | 0 | ~4 GB |
| **Итого** | **~6.5 / 8 GB** | **~10 GB + swap** |

Дефолты уже в `env.example` и `presets/8gb-vram.env`.

### Если CUDA OOM (`out of memory`)

```bash
bash deploy/prod/scripts/check-gpu.sh
```

**Вариант 1 — меньше слоёв Llama на GPU** (`deploy/prod/.env`):

```env
LLAMA_N_GPU_LAYERS=16
LLAMA_CTX_SIZE=4096
```

**Вариант 2 — TEI на CPU, Llama на полный GPU** (быстрее чат, медленнее embed):

```bash
docker compose --env-file deploy/prod/.env \
  -f deploy/prod/compose.yml -f deploy/prod/compose.tei-cpu.override.yml up -d
```

```env
LLAMA_N_GPU_LAYERS=99
LLAMA_CTX_SIZE=8192
```

**Вариант 3 — Qwen 3B вместо 7B** (всё на GPU без OOM):

```env
LLAMA_MODEL_URL=https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf
LLAMA_MODEL_FILE=Qwen2.5-3B-Instruct-Q4_K_M.gguf
LLAMA_N_GPU_LAYERS=99
LLAMA_CTX_SIZE=8192
```

Если образ TEI `89-1.7` не тянется:

```env
TEI_CUDA_IMAGE=ghcr.io/huggingface/text-embeddings-inference:ampere-1.7
```

## Индексация базы знаний

```bash
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml exec app npm run kb:ingest
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml exec app npm run kb:reindex-books
```

## Откат RAG (emergency)

В `deploy/prod/.env`:

```env
RAG_V2_ENABLED=false
```

```bash
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d app
```

См. также [`docs/ops/RAG_OPS_RUNBOOK.md`](../../docs/ops/RAG_OPS_RUNBOOK.md) §7.
