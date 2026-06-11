# Перенос RAG-базы с удалённого сервера

Перенос **VectorKB** (PostgreSQL + pgvector) с удалённого хоста (например `83.166.253.250`) на **локальный postgres** в Docker на новом prod-сервере.

## Апгрейд PG 16 → 18 в том же volume

**Важно (Sprint D0):** образ PG 18 монтирует `pg-data` в `/var/lib/postgresql` (данные в `18/docker/`), а PG 16 писал в `/var/lib/postgresql/data`.  
Простой `prod:up` с существующим volume **не подхватит** старый кластер — контейнер поднимет пустую БД.

Перед обновлением compose на pilot-сервере:

```bash
# 1. Дамп из работающего PG16
docker compose ... exec -T postgres pg_dump -U avg -Fc avgexpert > /backup/avgexpert-pg16.dump

# 2. Остановить стек, удалить volume (или новый volume)
docker compose ... down
docker volume rm avgexpert-prod_pg-data   # только после успешного дампа!

# 3. prod:up на PG18, restore
npm run prod:up
docker compose ... exec -T postgres pg_restore -U avg -d avgexpert --clean --if-exists < /backup/avgexpert-pg16.dump
npm run kb:pg:smoke
```

Альтернатива для нового сервера: перенос с удалённого PG (§ниже) сразу в PG 18.

## Что переносится

| Таблица | Содержимое |
|---------|------------|
| `kb_documents` | Метаданные документов (книги, user KB, session) |
| `kb_chunks` | Тексты + **векторы** embedding (1024d, bge-m3) |
| `kb_semantic_nodes` | Семантический граф (если был) |
| `kb_semantic_edges` | Связи графа |
| `vector_migrations` | Отметки применённых миграций |

## Что НЕ в PostgreSQL

| Данные | Где хранятся |
|--------|--------------|
| Пользователи, сессии чата, настройки | **SQLite** `data/` на Gateway |
| Старый индекс Yandex 256d | `avg_vector_chunks` — **не переносить** (несовместимые векторы) |

Если на удалённом сервере заполнен только `avg_vector_chunks`, а `kb_chunks` пуст — нужен **re-index**, не dump:

```bash
npm run kb:reindex-books
```

---

## Условия совместимости

Перенос `pg_dump` возможен только если:

- [ ] `kb_chunks.embedding` = **1024** измерений (bge-m3)
- [ ] namespace совпадает с prod (обычно `bge-m3-v1`)
- [ ] Источник доступен по сети с нового сервера (порт **5432**)

Проверка на источнике:

```sql
SELECT COUNT(*) FROM kb_chunks;
SELECT DISTINCT namespace FROM kb_chunks;
SELECT vector_dims(embedding) FROM kb_chunks LIMIT 1;
```

---

## Пошаговая инструкция

### 1. Подготовка нового сервера

```bash
sudo bash deploy/prod/scripts/prepare-server.sh
sudo bash deploy/prod/install.sh   # Docker + postgres контейнер
```

### 2. Доступ к удалённой БД

У провайдера / на старом сервере разрешите подключение с **IP нового сервера**:

```
новый_IP → 83.166.253.250:5432
```

Или сделайте дамп **с машины, где уже есть доступ** (ваш ПК + VPN), затем скопируйте `.dump` на сервер:

```bash
pg_dump "postgresql://avg:PASS@83.166.253.250:5432/avg_dev" \
  -t kb_documents -t kb_chunks -t kb_semantic_nodes -t kb_semantic_edges \
  --data-only -Fc -f rag_kb.dump

scp rag_kb.dump user@НОВЫЙ_СЕРВЕР:/tmp/
```

### 3. Конфигурация переноса

```bash
cd /opt/avgexpert/avgexpert
cp deploy/prod/.env.migrate.example deploy/prod/.env.migrate
nano deploy/prod/.env.migrate
```

```env
SOURCE_DATABASE_URL=postgresql://avg:ПАРОЛЬ@83.166.253.250:5432/avg_dev
EMBEDDING_DIMS=1024
```

Убедитесь, что `deploy/prod/.env` содержит пароль **локального** postgres.

### 4. Проверка без записи

```bash
bash deploy/prod/scripts/migrate-rag-db.sh --dry-run
```

### 5. Перенос

```bash
bash deploy/prod/scripts/migrate-rag-db.sh
```

Скрипт:

1. Проверяет источник (кол-во чанков, размерность)
2. Поднимает `postgres` в Docker
3. Применяет миграции схемы
4. `pg_dump --data-only` с источника
5. Очищает целевые таблицы
6. `pg_restore` в локальный postgres
7. `kb:pg:smoke` + `embedding:smoke`

### 6. Запуск приложения

```bash
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d
bash deploy/prod/scripts/post-deploy.sh
```

### 7. Smoke RAG в UI

- Чат **Консультант** / **Эксперт** с включённым RAG
- Ответ должен содержать контекст из перенесённой базы
- `GET /health` → `vector.store=ok`

---

## Объём и время

| kb_chunks | Примерный dump | Время |
|-----------|----------------|-------|
| ~5 000 | ~200–500 MB | 5–15 мин |
| ~50 000 | ~2–5 GB | 30–60 мин |

Индекс HNSW пересоздавать не нужно — он в схеме, данные вставляются в существующую таблицу.

---

## Откат

Локальная БД в Docker-volume `pg-data`. Для сброса:

```bash
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml down
docker volume rm avgexpert-prod_pg-data
# повторить migrate-rag-db.sh
```

Удалённая база **не изменяется** (только чтение через pg_dump).

---

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| `connection refused` к 83.166.253.250 | Firewall / whitelist IP нового сервера |
| dims 256 ≠ 1024 | Re-index: `kb:reindex-books`, не dump |
| `kb_chunks` пуст на источнике | Re-index с книг или экспорт текстов |
| pg_restore warnings | Смотрите итоговый `COUNT(*)` — скрипт сверяет |
| Медленный поиск после переноса | `REINDEX INDEX kb_chunks_embedding_hnsw_idx;` в psql |

---

## Бэкап локального PG 18 (после переноса)

```bash
# Скрипт (рекомендуется)
npm run prod:pg-backup
# → deploy/prod/backups/avgexpert-pg18-YYYYMMDD-HHMMSS.dump

# One-liner
docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml \
  exec -T postgres pg_dump -U avg -Fc avgexpert > avgexpert-backup.dump
```

Восстановление: `pg_restore --clean --if-exists` через `docker compose exec -T postgres` (см. вывод `pg-backup.sh`).

---

## Чеклист

- [ ] `migrate-rag-db.sh --dry-run` OK
- [ ] `kb_chunks` count источник = цель
- [ ] `vector_dims` = 1024
- [ ] `kb:pg:smoke` PASS
- [ ] `embedding:smoke` PASS
- [ ] Тестовый RAG-чат в WEB
