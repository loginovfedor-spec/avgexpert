# Разработка на ноутбуке + сервисы в Docker на удалённом сервере

**ADR-4 (утверждено):** приложение **локально** на ноутбуке; **инфраструктура** (PG 18, TEI, Llama, Envoy) — в Docker на **удалённом** pilot-сервере.  
Цель этапа: подготовить переход на опытную эксплуатацию в интернете без тяжёлого Docker на ноутбуке.

**Связанные документы (единый сценарий pilot):**

| Шаг | Документ |
|-----|----------|
| Первый выкат на сервер | [`SSH_DEPLOY.md`](../prod/SSH_DEPLOY.md) |
| Перенос RAG KB | [`RAG_DB_MIGRATION.md`](../prod/RAG_DB_MIGRATION.md) |
| Ежедневный цикл dev → pilot | [`DEV_TO_PILOT.md`](../prod/DEV_TO_PILOT.md) |
| Prod compose / GPU | [`README.md`](../prod/README.md) |

---

## Схема

```mermaid
graph LR
    subgraph laptop [Ноутбук]
        IDE[IDE + npm start]
        Tests[npm test]
    end
    subgraph remote [Pilot-сервер Docker]
        PG[(PG 18 pgvector)]
        TEI[TEI]
        LLAMA[Llama]
        ENVOY[Envoy]
    end
    IDE -->|DATABASE_URL SSH tunnel| PG
    IDE -->|EMBEDDING_API_URL| TEI
    IDE -->|LLAMACPP_URL| LLAMA
    IDE -->|provider via| ENVOY
```

| Где | Что |
|-----|-----|
| **Ноутбук** | `npm start`, `npm run dev:web`, `npm test`; app + users/sessions через `DATABASE_URL` → pilot PG |
| **Удалённый сервер** | `deploy/prod/compose.yml` — PG, TEI, Llama, Envoy (+ app в Docker для pilot WEB) |

---

## Быстрый старт (ноутбук)

### 1. Сервисы на сервере

На pilot-сервере (один раз, с ноутбука):

```bash
cd avgexpert
cp deploy/prod/ssh-deploy.env.example deploy/prod/ssh-deploy.env
# SERVER, GIT_REPO, REMOTE_ROOT

npm run prod:ssh-prepare   # prepare-server.sh (locale, swap, UFW)
# reboot на сервере при необходимости
npm run prod:ssh-install   # install.sh → compose up (PG 18, TEI, Llama, …)
```

Или вручную на сервере: `sudo bash deploy/prod/scripts/prepare-server.sh` → `sudo bash deploy/prod/install.sh`.

### 2. SSH-туннели (ноутбук)

**Рекомендуется** — один скрипт на все порты:

```bash
# Git Bash / WSL / Linux
export PILOT=user@PILOT_IP
bash deploy/dev/tunnel.sh
```

```powershell
# Windows CMD
set PILOT=user@PILOT_IP
deploy\dev\tunnel.cmd
```

Скрипт читает `SERVER` из `deploy/prod/ssh-deploy.env`, если `PILOT` не задан.

| Локальный порт | Сервис на pilot |
|----------------|-----------------|
| `5433` | PostgreSQL 18 (`127.0.0.1:5432`) |
| `8090` | TEI bge-m3 embed |
| `8091` | TEI bge-reranker |
| `8201` | Llama-cpp |

Вручную (отдельные терминалы):

```powershell
ssh -N -L 5433:127.0.0.1:5432 user@PILOT_IP
ssh -N -L 8090:127.0.0.1:8090 user@PILOT_IP
ssh -N -L 8201:127.0.0.1:8201 user@PILOT_IP
```

### 3. `.env` на ноутбуке

Скопировать `deploy/dev/env.laptop-remote.example` → `.env`:

```env
DATABASE_URL=postgresql://avg:PASS@127.0.0.1:5433/avgexpert
VECTOR_EMBEDDING_CONFIG=bge_m3.local
EMBEDDING_API_URL=http://127.0.0.1:8090/embed
RERANK_API_URL=http://127.0.0.1:8091/rerank
LLAMACPP_URL=http://127.0.0.1:8201/v1
RAG_V2_ENABLED=true
FTS_FALLBACK_ENABLED=true
FTS_FALLBACK_BACKEND=pg_tsvector
```

### 4. Запуск app

```bash
cd avgexpert
npm start
# UI: http://127.0.0.1:8200
```

### 5. Smoke с ноутбука (через туннель)

```bash
# Туннели должны быть открыты
npm run kb:pg:smoke
npm run embedding:smoke
npm run test:pr
```

---

## Firewall / сеть (checklist)

### На pilot-сервере (`prepare-server.sh` / UFW)

| Порт | Назначение | Доступ |
|------|------------|--------|
| 22 | SSH | Админы / ваш IP |
| 80 | HTTP (nginx, ACME) | Публично |
| 443 | HTTPS | Публично |
| 5432, 8090, 8091, 8200, 8201 | PG, TEI, app | **Только localhost** (compose bind `127.0.0.1`) |

- [ ] UFW: `OpenSSH`, `80/tcp`, `443/tcp` — см. `deploy/prod/scripts/prepare-server.sh`
- [ ] Security group облака: 80/443 inbound; **не** открывать 5432 наружу
- [ ] PG/TEI/Llama доступны с ноутбука **только через SSH-туннель** (или VPN)

### На старом PG (источник RAG для migrate)

- [ ] Whitelist **IP pilot-сервера** → `SOURCE_HOST:5432` (см. [`RAG_DB_MIGRATION.md`](../prod/RAG_DB_MIGRATION.md))

### На ноутбуке

- [ ] SSH-ключ в `authorized_keys` на pilot
- [ ] `BatchMode` / без интерактивного пароля для `prod:ssh-*`
- [ ] Туннели живы на время `npm start` и smoke-тестов

---

## Переход на опытный prod (app в Docker)

Когда app тоже в Docker на сервере:

1. `npm run prod:ssh-update` — пересборка только контейнера `app`
2. Ноутбук: тесты + правки кода; браузер → `https://pilot-домен/`
3. `DATABASE_URL` на сервере — внутренний `postgres:5432`, туннель не нужен

Подробный цикл: [`DEV_TO_PILOT.md`](../prod/DEV_TO_PILOT.md).

---

## Чеклист готовности ноутбука

- [ ] SSH-ключ на pilot-сервер
- [ ] `deploy/prod/ssh-deploy.env` настроен (для `tunnel.sh` и `prod:ssh-*`)
- [ ] Туннели (`tunnel.sh` / `tunnel.cmd`) или VPN к PG / TEI / Llama
- [ ] `kb:pg:smoke` с ноутбука через туннель
- [ ] `npm run test:pr` локально
- [ ] Чат с RAG против удалённого PG

---

## См. также

- [`deploy/prod/README.md`](../prod/README.md)
- [`docs/plans/PG18_DOCKER_UNIFIED_PLAN.md`](../../docs/plans/PG18_DOCKER_UNIFIED_PLAN.md)
