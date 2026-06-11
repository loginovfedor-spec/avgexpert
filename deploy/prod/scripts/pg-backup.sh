#!/usr/bin/env bash
# Бэкап локального PostgreSQL 18 (RAG + схема) из Docker compose.
#
# Usage:
#   bash deploy/prod/scripts/pg-backup.sh
#   BACKUP_DIR=/backup bash deploy/prod/scripts/pg-backup.sh
#
# One-liner (без скрипта):
#   docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml \
#     exec -T postgres pg_dump -U avg -Fc avgexpert > avgexpert-$(date +%Y%m%d-%H%M).dump
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEPLOY_DIR="$APP_ROOT/deploy/prod"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE_FILE="$DEPLOY_DIR/compose.yml"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_FILE:-$BACKUP_DIR/avgexpert-pg18-${TIMESTAMP}.dump}"

[[ -f "$ENV_FILE" ]] || { echo "Нет $ENV_FILE"; exit 1; }

# shellcheck disable=SC1090
source "$ENV_FILE"
: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"

mkdir -p "$BACKUP_DIR"

# Docker Desktop on Git Bash: destination path for docker cp
backup_host_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$BACKUP_FILE"
  elif pwd -W >/dev/null 2>&1; then
    echo "$(cd "$(dirname "$BACKUP_FILE")" && pwd -W)/$(basename "$BACKUP_FILE")"
  else
    echo "$BACKUP_FILE"
  fi
}

PG_CONTAINER="${PG_CONTAINER:-avgexpert-pg}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

ensure_pg_running() {
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    if ! docker exec "$PG_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      echo "Запуск $PG_CONTAINER..."
      docker start "$PG_CONTAINER" >/dev/null
      for _ in $(seq 1 30); do
        docker exec "$PG_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && return
        sleep 2
      done
      echo "ERROR: $PG_CONTAINER не готов"
      exit 1
    fi
  fi
}

pg_dump_local() {
  local container_path="/tmp/avgexpert-pg18-backup.dump"
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
    ensure_pg_running
    MSYS_NO_PATHCONV=1 docker exec "$PG_CONTAINER" rm -f "$container_path"
    MSYS_NO_PATHCONV=1 docker exec "$PG_CONTAINER" pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -Fc \
      --no-owner \
      --no-acl \
      -f "$container_path"
    MSYS_NO_PATHCONV=1 docker cp "${PG_CONTAINER}:${container_path}" "$(backup_host_path)"
    MSYS_NO_PATHCONV=1 docker exec "$PG_CONTAINER" rm -f "$container_path"
  else
    compose exec -T postgres pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -Fc \
      --no-owner \
      --no-acl \
      > "$BACKUP_FILE"
  fi
}

echo "=== PG 18 backup ==="
echo "Цель: $BACKUP_FILE"

pg_dump_local

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "OK: $BACKUP_FILE ($SIZE)"
echo ""
echo "Восстановление:"
echo "  cat $BACKUP_FILE | docker compose --env-file $ENV_FILE -f $COMPOSE_FILE \\"
echo "    exec -T postgres pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists"
