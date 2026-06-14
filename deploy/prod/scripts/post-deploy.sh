#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="$ROOT/deploy/prod/.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy env.example first."
  exit 1
fi

# shellcheck source=compose-stack.sh
source "$SCRIPT_DIR/compose-stack.sh"

cd "$ROOT"

echo "[post-deploy] stack: $COMPOSE_STACK"

echo "[post-deploy] PG migrations..."
compose_prod exec -T app npm run kb:pg:migrate

echo "[post-deploy] App schema smoke..."
compose_prod exec -T app npm run app:pg:smoke

echo "[post-deploy] PG smoke..."
compose_prod exec -T app npm run kb:pg:smoke

echo "[post-deploy] Embedding smoke..."
compose_prod exec -T app npm run embedding:smoke

echo "[post-deploy] Health..."
curl -fsS http://127.0.0.1:8200/health | head -c 500
echo

if compose_prod ps --status running 2>/dev/null | grep -q avgexpert-nginx; then
  echo "[post-deploy] Reload nginx (refresh upstream after app recreate)..."
  compose_prod exec -T nginx nginx -s reload 2>/dev/null || true
fi

echo "[post-deploy] Done. Open WEB via nginx (:80) or gateway (:8200 localhost)."
