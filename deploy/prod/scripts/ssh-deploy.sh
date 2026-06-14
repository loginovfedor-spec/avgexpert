#!/usr/bin/env bash
# Deploy AvgExpert to remote server via SSH (run from your PC: Git Bash / WSL / Linux)
set -euo pipefail

ACTION="${1:-install}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$APP_ROOT/deploy/prod/ssh-deploy.env"

usage() {
  echo "Usage: bash deploy/prod/scripts/ssh-deploy.sh [prepare|install|update|status|logs|acceptance]"
  echo "  acceptance: D6 pilot-acceptance.sh on remote (optional: pass --migrate-rag etc.)"
  echo "  Configure: cp deploy/prod/ssh-deploy.env.example deploy/prod/ssh-deploy.env"
  exit 1
}

[[ -f "$CONFIG_FILE" ]] || {
  echo "Missing $CONFIG_FILE"
  echo "Copy: cp deploy/prod/ssh-deploy.env.example deploy/prod/ssh-deploy.env"
  exit 1
}

# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${SERVER:?set SERVER in ssh-deploy.env}"
: "${REMOTE_ROOT:?set REMOTE_ROOT}"
DEPLOY_MODE="${DEPLOY_MODE:-git}"
SSH_PORT="${SSH_PORT:-22}"
GIT_BRANCH="${GIT_BRANCH:-main}"

SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15)
REMOTE_APP="$REMOTE_ROOT/avgexpert"

ssh_cmd() {
  ssh "${SSH_OPTS[@]}" "$SERVER" "$@"
}

echo "=== AvgExpert SSH deploy ($ACTION) ==="
echo "Server: $SERVER"
echo "Remote: $REMOTE_APP"

echo "[check] SSH connection..."
ssh_cmd "echo OK && uname -a"

sync_code() {
  if [[ "$DEPLOY_MODE" == "rsync" ]]; then
  : "${LOCAL_REPO_ROOT:?set LOCAL_REPO_ROOT for rsync mode}"
    echo "[sync] rsync → $SERVER:$REMOTE_ROOT"
    ssh_cmd "mkdir -p '$REMOTE_ROOT'"
    rsync -avz --delete \
      -e "ssh ${SSH_OPTS[*]}" \
      --exclude node_modules \
      --exclude .git \
      --exclude data \
      --exclude data_test \
      --exclude '**/.env' \
      --exclude local-dev/data \
      "$LOCAL_REPO_ROOT/" "$SERVER:$REMOTE_ROOT/"
  else
    echo "[sync] git clone/pull on server"
    ssh_cmd "mkdir -p '$REMOTE_ROOT' && \
      if [[ -d '$REMOTE_APP/.git' ]]; then \
        cd '$REMOTE_APP' && git fetch && git checkout '$GIT_BRANCH' && git pull; \
      else \
        git clone -b '$GIT_BRANCH' '$GIT_REPO' '$REMOTE_ROOT'; \
      fi"
  fi
}

case "$ACTION" in
  prepare)
    sync_code
    echo "[prepare] system update, ru_RU locale, swap, firewall..."
    ssh_cmd "cd '$REMOTE_APP' && sudo bash deploy/prod/scripts/prepare-server.sh"
    echo "Reboot recommended: ssh $SERVER sudo reboot"
    ;;
  install)
    sync_code
    echo "[prepare] server prep (skip if already done)..."
    ssh_cmd "cd '$REMOTE_APP' && sudo bash deploy/prod/scripts/prepare-server.sh" || true
    echo "[install] remote install.sh (Docker, GPU, compose up)..."
    ssh_cmd "cd '$REMOTE_APP' && sudo bash deploy/prod/install.sh"
    echo ""
    echo "=== Next steps (on server) ==="
    echo "  ssh $SERVER"
    echo "  cd $REMOTE_APP"
    echo "  nano deploy/prod/.env          # admin password, domain"
    echo "  nano deploy/prod/providers/openai_gpt4_1.env  # API keys"
    echo "  docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d"
    echo "  bash deploy/prod/scripts/post-deploy.sh"
    ;;
  update)
    sync_code
    echo "[update] rebuild app..."
    ssh_cmd "cd '$REMOTE_APP' && \
      docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d --build app && \
      bash deploy/prod/scripts/post-deploy.sh"
    ;;
  status)
    ssh_cmd "cd '$REMOTE_APP' && docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml ps && bash deploy/prod/scripts/check-gpu.sh"
    ;;
  logs)
    ssh_cmd "cd '$REMOTE_APP' && docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml logs -f --tail=100"
    ;;
  acceptance)
    shift || true
    EXTRA_ARGS=("$@")
    ssh_cmd "cd '$REMOTE_APP' && bash deploy/prod/scripts/pilot-acceptance.sh ${EXTRA_ARGS[*]:-}"
    ;;
  *)
    usage
    ;;
esac

echo "Done."
