# Sprint D6 — Приёмка pilot (L4 vGPU-8-16-L4-8Q)

Автоматизированная приёмка опытной эксплуатации на Tesla L4. Соответствует [`PG18_DOCKER_UNIFIED_PLAN.md` §6 D6](../../docs/plans/PG18_DOCKER_UNIFIED_PLAN.md) и чеклисту §7.

## Предварительные условия

| Проверка | Команда |
|----------|---------|
| D5 завершён (compose, ssh-deploy, DEV_REMOTE) | `docs/sprints/SPRINT_STATE.md` |
| SSH на pilot | `ssh user@IP` |
| `deploy/prod/.env` | пароль admin, `PUBLIC_BASE_URL`, `AVGEXPERT_DEPLOY_ENV=production` |
| `deploy/prod/.env.migrate` | для переноса RAG (D6-2) |
| `deploy/prod/providers/*.env` | API-ключи LLM |
| HTTPS (Let's Encrypt) | [README.md § HTTPS](README.md) |

## Быстрый сценарий

### 1. Первый деплой (D6-1)

```bash
# С ноутбука (Git Bash / WSL)
cd avgexpert
cp deploy/prod/ssh-deploy.env.example deploy/prod/ssh-deploy.env
# → SERVER, GIT_REPO, REMOTE_ROOT

npm run prod:ssh-install
```

На сервере после `install.sh`:

```bash
nano deploy/prod/.env              # AVGEXPERT_ADMIN_PASSWORD, PUBLIC_DOMAIN
nano deploy/prod/providers/openai_gpt4_1.env
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d
bash deploy/prod/scripts/post-deploy.sh
```

Настройте HTTPS (certbot + `ssl.conf`), перезапустите nginx.

### 2. Перенос RAG (D6-2)

```bash
# На сервере
cp deploy/prod/.env.migrate.example deploy/prod/.env.migrate
# → SOURCE_DATABASE_URL (удалённый PG 18 с corpus)

bash deploy/prod/scripts/migrate-rag-db.sh
# или с ноутбука после SSH-туннеля к pilot PG — см. RAG_DB_MIGRATION.md
```

### 3. Полная приёмка (D6-1…D6-6)

```bash
# На сервере
bash deploy/prod/scripts/pilot-acceptance.sh --migrate-rag

# С ноутбука
npm run prod:ssh-acceptance
```

Опции:

| Флаг | Назначение |
|------|------------|
| `--migrate-rag` | Запустить `migrate-rag-db.sh` перед smoke |
| `--skip-resilience` | Пропустить рестарт app/postgres (D6-5) |

### 4. Только пользователи (D6-3)

```bash
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml \
  exec app npm run prod:seed-pilot-users
```

| Пользователь | Роль | Пароль |
|--------------|------|--------|
| `admin` | Администратор | `AVGEXPERT_ADMIN_PASSWORD` из `.env` |
| `pilot_consultant` | Консультант | `PILOT_TEST_PASSWORD` (default `PilotTest2026!`) |
| `pilot_expert` | Эксперт | то же |
| `pilot_sage` | Мудрец | то же |

Задайте `PILOT_TEST_PASSWORD` в `deploy/prod/.env` перед seed на pilot.

## Что проверяет `pilot-acceptance.sh`

| ID | Проверка |
|----|----------|
| D6-1 | compose app/nginx, `/health` :8200, HTTPS/HTTP снаружи |
| D6-2 | `kb:pg:smoke`, `embedding:smoke`, `kb_chunks` > 0 |
| D6-3 | `prod:seed-pilot-users`, login admin + pilot_consultant |
| D6-4 | `vector.store` ok/degraded, admin `rag_metrics`, `load:rag-retrieval` p95 |
| D6-5 | restart app + postgres, сохранность chunks и users |
| D6-6 | напоминание о sign-off §7 ниже |

## 7. Чеклист приёмки программы (sign-off)

Отметьте после успешного `pilot-acceptance.sh` и ручного smoke в браузере.

### Инфраструктура

- [ ] PostgreSQL **18** + pgvector в Docker prod
- [ ] Dev-remote: ноутбук + сервисы на pilot Docker
- [ ] `DATABASE_URL` один для app и RAG

### Данные

- [ ] RAG перенесён с удалённого PG 18
- [ ] App-данные созданы заново (seed)
- [ ] SQLite файлы не используются

### Качество RAG

- [ ] Штатный путь: pgvector + bge-m3 (+ rerank при включении)
- [ ] FTS fallback: PG `tsvector` (`russian`) на `kb_chunks`
- [ ] Smoke chat: consultant + expert (контекст в ответе)

### Код и тесты

- [ ] `test:ci` PASS (на ноутбуке перед выкатом)
- [ ] `test:rag`, `test:vector` PASS на PG

### Эксплуатация

- [ ] Бэкап / restore PG проверен (`npm run prod:pg-backup`)
- [ ] Выкат с ноутбука: `npm run prod:ssh-update`
- [ ] Документация актуальна

**Sign-off:** _______________  **Дата:** _______________

---

## npm-скрипты

| Команда | Где выполнять |
|---------|---------------|
| `npm run prod:acceptance` | На сервере (bash) |
| `npm run prod:ssh-acceptance` | С ноутбука (SSH) |
| `npm run prod:seed-pilot-users` | В контейнере `app` |
| `npm run test:d6` | CI / ноутбук (unit seed) |

## Типичные проблемы

| Симптом | Решение |
|---------|---------|
| `kb_chunks empty` | `migrate-rag-db.sh` или `kb:reindex-books` |
| `load:rag-retrieval` FAIL | TEI на GPU; `check-gpu.sh`; снизить concurrency |
| HTTPS FAIL | certbot, `ssl.conf`, firewall :443 |
| admin login FAIL | `AVGEXPERT_ADMIN_PASSWORD` в `.env`, `prod:seed-pilot-users` |

См. также [SSH_DEPLOY.md](SSH_DEPLOY.md), [RAG_DB_MIGRATION.md](RAG_DB_MIGRATION.md), [DEV_TO_PILOT.md](DEV_TO_PILOT.md).
