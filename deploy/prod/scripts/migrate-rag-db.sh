#!/usr/bin/env bash
# Перенос RAG VectorKB: удалённый PostgreSQL 18 → локальный PG 18 в Docker
#
# Требования:
#   - docker + compose v2
#   - postgresql-client ИЛИ образ postgres:18 (fallback через docker)
#   - deploy/prod/.env и deploy/prod/.env.migrate
#
# Usage:
#   bash deploy/prod/scripts/migrate-rag-db.sh
#   bash deploy/prod/scripts/migrate-rag-db.sh --dry-run
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEPLOY_DIR="$APP_ROOT/deploy/prod"
ENV_FILE="$DEPLOY_DIR/.env"
MIGRATE_ENV="$DEPLOY_DIR/.env.migrate"
COMPOSE_FILE="$DEPLOY_DIR/compose.yml"
DUMP_FILE="${DUMP_FILE:-$DEPLOY_DIR/backups/avgexpert-rag-kb.dump}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:18}"

TABLES=(
  kb_documents
  kb_chunks
  kb_semantic_nodes
  kb_semantic_edges
  vector_migrations
)

[[ -f "$ENV_FILE" ]] || { echo "Нет $ENV_FILE — cp deploy/prod/env.example deploy/prod/.env"; exit 1; }
[[ -f "$MIGRATE_ENV" ]] || {
  echo "Нет $MIGRATE_ENV"
  echo "Скопируйте: cp deploy/prod/.env.migrate.example deploy/prod/.env.migrate"
  exit 1
}

# shellcheck disable=SC1090
source "$ENV_FILE"
# shellcheck disable=SC1090
source "$MIGRATE_ENV"

: "${SOURCE_DATABASE_URL:?задайте SOURCE_DATABASE_URL в .env.migrate}"
: "${POSTGRES_USER:?}"
: "${POSTGRES_PASSWORD:?}"
: "${POSTGRES_DB:?}"
EMBEDDING_DIMS="${EMBEDDING_DIMS:-1024}"
EXPECTED_NAMESPACE="${EXPECTED_NAMESPACE:-}"

TARGET_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

use_docker_pg_client() {
  ! command -v psql >/dev/null 2>&1 || ! command -v pg_dump >/dev/null 2>&1
}

psql_cmd() {
  if use_docker_pg_client; then
    docker run --rm -i "$PG_CLIENT_IMAGE" psql "$@" 
  else
    psql "$@"
  fi
}

pg_dump_cmd() {
  local dump_dir dump_name vol
  dump_dir="$(cd "$(dirname "$DUMP_FILE")" && pwd)"
  dump_name="$(basename "$DUMP_FILE")"
  if use_docker_pg_client; then
    vol="$dump_dir"
    # Docker Desktop on Git Bash: /e/foo → //e/foo
    if [[ "$vol" =~ ^/[a-zA-Z]/ ]]; then
      vol="//${vol:1}"
    fi
    MSYS_NO_PATHCONV=1 docker run --rm \
      -v "${vol}:/dump" \
      "$PG_CLIENT_IMAGE" \
      pg_dump "$@" -f "/dump/${dump_name}"
  else
    pg_dump "$@" -f "$DUMP_FILE"
  fi
}

psql_source() {
  psql_cmd "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

psql_target() {
  psql_cmd "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

run_kb_migrate() {
  if compose ps --status running app 2>/dev/null | grep -q avgexpert-gateway; then
    compose exec -T app npm run kb:pg:migrate
  else
    echo "  (host) npm run kb:pg:migrate → $TARGET_DATABASE_URL"
    (cd "$APP_ROOT" && DATABASE_URL="$TARGET_DATABASE_URL" npm run kb:pg:migrate)
  fi
}

run_kb_smoke() {
  if compose ps --status running app 2>/dev/null | grep -q avgexpert-gateway; then
    compose exec -T app npm run kb:pg:smoke
  else
    (cd "$APP_ROOT" && DATABASE_URL="$TARGET_DATABASE_URL" npm run kb:pg:smoke)
  fi
}

run_embedding_smoke() {
  if compose ps --status running app 2>/dev/null | grep -q avgexpert-gateway; then
    compose exec -T app npm run embedding:smoke
  else
    (cd "$APP_ROOT" && npm run embedding:smoke)
  fi
}

echo "=== Перенос RAG VectorKB (PG 18) ==="
if use_docker_pg_client; then
  echo "Клиент: docker $PG_CLIENT_IMAGE (psql/pg_dump не в PATH)"
fi
echo "Источник: $(echo "$SOURCE_DATABASE_URL" | sed -E 's#://([^:]+):[^@]+@#://\1:***@#')"
echo "Цель:     postgresql://${POSTGRES_USER}:***@127.0.0.1:5432/${POSTGRES_DB}"
echo ""

echo "[1/8] Проверка источника..."
psql_source -c "SELECT version();" >/dev/null

SRC_DOCS=$(psql_source -tAc "SELECT COUNT(*) FROM kb_documents" 2>/dev/null || echo "0")
SRC_CHUNKS=$(psql_source -tAc "SELECT COUNT(*) FROM kb_chunks" 2>/dev/null || echo "0")

if [[ "$SRC_CHUNKS" == "0" ]]; then
  echo "WARNING: kb_chunks пуст на источнике."
  echo "  Если данные только в legacy avg_vector_chunks — нужен re-index:"
  echo "  npm run kb:reindex-books"
fi

SRC_DIMS=$(psql_source -tAc "SELECT vector_dims(embedding) FROM kb_chunks LIMIT 1" 2>/dev/null || echo "")
if [[ -n "$SRC_DIMS" && "$SRC_DIMS" != "$EMBEDDING_DIMS" ]]; then
  echo "ERROR: размерность embedding на источнике=$SRC_DIMS, ожидается=$EMBEDDING_DIMS"
  echo "  Векторы несовместимы — нужен re-embed (kb:reindex-books), не pg_dump."
  exit 1
fi

SRC_NS=$(psql_source -tAc "SELECT DISTINCT namespace FROM kb_chunks ORDER BY 1" 2>/dev/null || true)
echo "  kb_documents: $SRC_DOCS"
echo "  kb_chunks:    $SRC_CHUNKS"
echo "  namespace:    ${SRC_NS:-—}"
echo "  dims:         ${SRC_DIMS:-—}"

if $DRY_RUN; then
  echo "[dry-run] Остановка после проверки источника."
  exit 0
fi

echo "[2/8] Postgres PG 18 в Docker..."
PG_CONTAINER="${PG_CONTAINER:-avgexpert-pg}"
if psql_target -c "SELECT 1" >/dev/null 2>&1; then
  echo "  PG 18 уже доступен на 127.0.0.1:5432"
elif docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  echo "  Запуск существующего контейнера $PG_CONTAINER"
  docker start "$PG_CONTAINER" >/dev/null
  for i in $(seq 1 30); do
    psql_target -c "SELECT 1" >/dev/null 2>&1 && break
    sleep 2
  done
else
  compose up -d postgres
  for i in $(seq 1 30); do
    compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && break
    sleep 2
  done
fi

echo "[3/8] Схема на цели (миграции)..."
run_kb_migrate

echo "[4/8] Дамп данных с источника..."
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  if psql_source -tAc "SELECT to_regclass('public.$t')" 2>/dev/null | grep -q "$t"; then
    TABLE_ARGS+=(-t "$t")
  fi
done

mkdir -p "$(dirname "$DUMP_FILE")"
rm -f "$DUMP_FILE"
pg_dump_cmd "$SOURCE_DATABASE_URL" \
  "${TABLE_ARGS[@]}" \
  --data-only \
  --no-owner \
  --no-acl \
  -Fc
echo "  dump: $DUMP_FILE ($(du -h "$DUMP_FILE" 2>/dev/null | cut -f1 || echo '?'))"

pg_exec_target() {
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  else
    compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  fi
}

pg_restore_target() {
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    docker exec -i "$PG_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  else
    compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  fi
}

echo "[5/8] Очистка целевых таблиц..."
pg_exec_target <<'SQL'
TRUNCATE TABLE
  kb_semantic_edges,
  kb_semantic_nodes,
  kb_chunks,
  kb_documents,
  vector_migrations
RESTART IDENTITY CASCADE;
SQL

echo "[6/8] pg_restore в локальный PG 18..."
RESTORE_LOG="$(mktemp 2>/dev/null || echo "${DUMP_FILE}.restore.log")"
set +e
cat "$DUMP_FILE" | pg_restore_target \
  --data-only \
  --disable-triggers \
  --no-owner \
  --no-acl \
  2>"$RESTORE_LOG"
RESTORE_RC=$?
set -e
if [[ $RESTORE_RC -ne 0 ]]; then
  if grep -qiE 'already exists|duplicate key|vector_migrations' "$RESTORE_LOG" 2>/dev/null; then
    echo "  pg_restore: non-fatal warnings (см. $RESTORE_LOG)"
  else
    echo "ERROR: pg_restore failed (rc=$RESTORE_RC)"
    tail -20 "$RESTORE_LOG" 2>/dev/null || true
    exit 1
  fi
fi

echo "[7/8] Проверка COUNT + vector_dims + namespace..."
TGT_DOCS=$(pg_exec_target -tAc "SELECT COUNT(*) FROM kb_documents")
TGT_CHUNKS=$(pg_exec_target -tAc "SELECT COUNT(*) FROM kb_chunks")
TGT_DIMS=$(pg_exec_target -tAc "SELECT vector_dims(embedding) FROM kb_chunks LIMIT 1" 2>/dev/null || echo "")
TGT_NS=$(pg_exec_target -tAc "SELECT DISTINCT namespace FROM kb_chunks ORDER BY 1" 2>/dev/null || true)

echo "  источник kb_chunks: $SRC_CHUNKS"
echo "  цель    kb_chunks: $TGT_CHUNKS"
echo "  цель    dims:      ${TGT_DIMS:-—}"
echo "  цель    namespace: ${TGT_NS:-—}"

if [[ "$SRC_CHUNKS" != "$TGT_CHUNKS" ]]; then
  echo "ERROR: количество чанков не совпадает"
  exit 1
fi

if [[ -n "$TGT_DIMS" && "$TGT_DIMS" != "$EMBEDDING_DIMS" ]]; then
  echo "ERROR: vector_dims на цели=$TGT_DIMS, ожидается=$EMBEDDING_DIMS"
  exit 1
fi

if [[ -n "$EXPECTED_NAMESPACE" ]]; then
  if ! echo "$TGT_NS" | grep -qx "$EXPECTED_NAMESPACE"; then
    echo "ERROR: namespace $EXPECTED_NAMESPACE не найден на цели"
    exit 1
  fi
  echo "  namespace $EXPECTED_NAMESPACE: OK"
fi

echo "[8/8] Smoke..."
run_kb_smoke
run_embedding_smoke

echo ""
echo "=== Перенос завершён ==="
echo "Дамп сохранён: $DUMP_FILE"
echo "Обновите .env: DATABASE_URL=$TARGET_DATABASE_URL"
echo "Запустите стек: npm run prod:up"
