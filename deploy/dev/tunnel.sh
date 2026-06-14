#!/usr/bin/env bash
# SSH tunnels: ноутбук → pilot Docker (PG, TEI embed/rerank, Llama)
# Usage:
#   export PILOT=user@203.0.113.10   # or set in deploy/prod/ssh-deploy.env → SERVER
#   bash deploy/dev/tunnel.sh
#
# Keep this terminal open while running npm start on the laptop.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SSH_DEPLOY_ENV="$APP_ROOT/deploy/prod/ssh-deploy.env"

if [[ -z "${PILOT:-}" ]] && [[ -f "$SSH_DEPLOY_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$SSH_DEPLOY_ENV"
  PILOT="${SERVER:-}"
  SSH_PORT="${SSH_PORT:-22}"
fi

: "${PILOT:?set PILOT=user@host or configure deploy/prod/ssh-deploy.env}"
SSH_PORT="${SSH_PORT:-22}"

LOCAL_PG_PORT="${LOCAL_PG_PORT:-5433}"
LOCAL_TEI_PORT="${LOCAL_TEI_PORT:-8090}"
LOCAL_RERANK_PORT="${LOCAL_RERANK_PORT:-8091}"
LOCAL_LLAMA_PORT="${LOCAL_LLAMA_PORT:-8201}"

echo "=== AvgExpert dev-remote tunnels ==="
echo "Pilot:  $PILOT (port $SSH_PORT)"
echo "Local:  PG $LOCAL_PG_PORT, TEI $LOCAL_TEI_PORT, rerank $LOCAL_RERANK_PORT, Llama $LOCAL_LLAMA_PORT"
echo "Press Ctrl+C to close tunnels."
echo ""

exec ssh -N \
  -p "$SSH_PORT" \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "${LOCAL_PG_PORT}:127.0.0.1:5432" \
  -L "${LOCAL_TEI_PORT}:127.0.0.1:8090" \
  -L "${LOCAL_RERANK_PORT}:127.0.0.1:8091" \
  -L "${LOCAL_LLAMA_PORT}:127.0.0.1:8201" \
  "$PILOT"
