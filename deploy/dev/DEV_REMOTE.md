# Разработка на ноутбуке + сервисы в Docker на удалённом сервере

**ADR-4 (утверждено):** приложение **локально** на ноутбуке; **инфраструктура** (PG 18, TEI, Llama, Envoy) — в Docker на **удалённом** pilot-сервере.  
Цель этапа: подготовить переход на опытную эксплуатацию в интернете без тяжёлого Docker на ноутбуке.

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
| **Ноутбук** | `npm start`, `npm run dev:web`, `npm test`, SQLite app (до D4) |
| **Удалённый сервер** | `deploy/prod/compose.yml` — PG, TEI, Llama, Envoy (+ позже app в Docker) |

---

## Быстрый старт (ноутбук)

### 1. Сервисы на сервере

На pilot-сервере (один раз):

```bash
cd /opt/avgexpert/avgexpert
sudo bash deploy/prod/scripts/prepare-server.sh
sudo bash deploy/prod/install.sh   # поднимает PG 18, TEI, Llama, …
```

### 2. SSH-туннели (ноутбук)

```powershell
# PG 18
ssh -N -L 5433:127.0.0.1:5432 user@PILOT_IP

# TEI embed
ssh -N -L 8090:127.0.0.1:8090 user@PILOT_IP

# Llama
ssh -N -L 8201:127.0.0.1:8201 user@PILOT_IP
```

### 3. `.env` на ноутбуке

Скопировать `deploy/dev/env.laptop-remote.example` → `.env`:

```env
DATABASE_URL=postgresql://avg:PASS@127.0.0.1:5433/avgexpert
VECTOR_EMBEDDING_CONFIG=bge_m3.local
EMBEDDING_API_URL=http://127.0.0.1:8090/embed
LLAMACPP_URL=http://127.0.0.1:8201/v1
RAG_V2_ENABLED=true
```

### 4. Запуск app

```bash
cd avgexpert
npm start
# UI: http://127.0.0.1:8200
```

---

## Переход на опытный prod

Когда app тоже уедет в Docker на сервере:

1. `npm run prod:ssh-update` — только контейнер `app`
2. Ноутбук: тесты + правки кода; браузер → `https://pilot-домен/`
3. `DATABASE_URL` на сервере — внутренний `postgres:5432`, не туннель

---

## Чеклист готовности ноутбука

- [ ] SSH-ключ на pilot-сервер
- [ ] Туннели или VPN к PG / TEI / Llama
- [ ] `kb:pg:smoke` с ноутбука через туннель
- [ ] `npm run test:pr` локально
- [ ] Чат с RAG против удалённого PG

---

## См. также

- [`deploy/prod/README.md`](../prod/README.md)
- [`deploy/prod/DEV_TO_PILOT.md`](../prod/DEV_TO_PILOT.md)
- [`docs/plans/PG18_DOCKER_UNIFIED_PLAN.md`](../../docs/plans/PG18_DOCKER_UNIFIED_PLAN.md)
