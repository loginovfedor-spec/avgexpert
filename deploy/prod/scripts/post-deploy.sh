#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/prod/compose.yml"
ENV_FILE="$ROOT/deploy/prod/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy env.example first."
  exit 1
fi

cd "$ROOT"

echo "[post-deploy] PG migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T app npm run kb:pg:migrate

echo "[post-deploy] PG smoke..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T app npm run kb:pg:smoke

echo "[post-deploy] Embedding smoke..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T app npm run embedding:smoke

echo "[post-deploy] Health..."
curl -fsS http://127.0.0.1:8200/health | head -c 500
echo
echo "[post-deploy] Done. Open WEB via nginx (:80) or gateway (:8200 localhost)."
