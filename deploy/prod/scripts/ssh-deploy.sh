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
COMPOSE_STACK="${COMPOSE_STACK:-cpu-pilot}"

SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15)
[[ -n "${SSH_IDENTITY:-}" ]] && SSH_OPTS+=(-i "$SSH_IDENTITY")
REMOTE_APP="$REMOTE_ROOT/avgexpert"

ssh_cmd() {
  ssh "${SSH_OPTS[@]}" "$SERVER" "$@"
}

remote_compose() {
  local remote_args
  remote_args=$(printf '%q ' "$@")
  ssh_cmd "cd '$REMOTE_APP' && COMPOSE_STACK='$COMPOSE_STACK' bash deploy/prod/scripts/compose-stack.sh run ${remote_args}"
}

echo "=== AvgExpert SSH deploy ($ACTION) ==="
echo "Server: $SERVER"
echo "Remote: $REMOTE_APP"
echo "Stack:  $COMPOSE_STACK"

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
    : "${GIT_REPO:?set GIT_REPO for git mode}"
    echo "[sync] git pull on server ($GIT_REPO)"
    ssh_cmd "mkdir -p '$REMOTE_ROOT' && \
      if [[ -d '$REMOTE_APP/.git' ]]; then \
        cd '$REMOTE_APP' && git fetch origin && git checkout '$GIT_BRANCH' && git reset --hard origin/$GIT_BRANCH; \
      elif [[ -d '$REMOTE_APP' ]]; then \
        cd '$REMOTE_APP' && git init && git remote add origin '$GIT_REPO' && \
          git fetch origin && git reset --hard origin/$GIT_BRANCH; \
      else \
        git clone -b '$GIT_BRANCH' '$GIT_REPO' '$REMOTE_APP'; \
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
    echo "[install] remote install.sh (Docker, GPU toolkit, compose up)..."
    ssh_cmd "cd '$REMOTE_APP' && COMPOSE_STACK='$COMPOSE_STACK' sudo -E bash deploy/prod/install.sh"
    echo ""
    echo "=== Next steps (on server) ==="
    echo "  ssh $SERVER"
    echo "  cd $REMOTE_APP"
    echo "  nano deploy/prod/.env          # COMPOSE_STACK, admin password, domain"
    echo "  bash deploy/prod/scripts/compose-stack.sh run ps"
    echo "  sudo bash deploy/prod/scripts/post-deploy.sh"
    ;;
  update)
    sync_code
    echo "[update] rebuild app (stack=$COMPOSE_STACK)..."
    remote_compose up -d --build app
    ssh_cmd "cd '$REMOTE_APP' && COMPOSE_STACK='$COMPOSE_STACK' sudo bash deploy/prod/scripts/post-deploy.sh"
    ;;
  status)
    remote_compose ps
    ssh_cmd "cd '$REMOTE_APP' && bash deploy/prod/scripts/check-gpu.sh"
    ;;
  logs)
    remote_compose logs -f --tail=100
    ;;
  acceptance)
    shift || true
    EXTRA_ARGS=("$@")
    ssh_cmd "cd '$REMOTE_APP' && COMPOSE_STACK='$COMPOSE_STACK' bash deploy/prod/scripts/pilot-acceptance.sh ${EXTRA_ARGS[*]:-}"
    ;;
  *)
    usage
    ;;
esac

echo "Done."
