#!/usr/bin/env bash
# Unified docker compose args for prod stack profiles.
# Profiles: cpu-pilot | gpu-l4 | gpu-l4-8gb  (see deploy/prod/stacks/README.md)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/prod/.env}"
DEPLOY_DIR="$ROOT/deploy/prod"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

COMPOSE_STACK="${COMPOSE_STACK:-cpu-pilot}"

DOCKER_BIN=()

resolve_docker() {
  DOCKER_BIN=()
  if [[ -n "${DOCKER_CMD:-}" ]]; then
    # shellcheck disable=SC2206
    DOCKER_BIN=($DOCKER_CMD)
  elif docker info >/dev/null 2>&1; then
    DOCKER_BIN=(docker)
  else
    DOCKER_BIN=(sudo docker)
  fi
}

stack_override_files() {
  case "$COMPOSE_STACK" in
    cpu-pilot)
      printf '%s\n' \
        compose.tei-cpu.override.yml \
        compose.llama-cpu.override.yml \
        compose.deps.override.yml \
        compose.server.override.yml
      ;;
    gpu-l4)
      printf '%s\n' compose.server.override.yml
      ;;
    gpu-l4-8gb)
      printf '%s\n' \
        compose.tei-cpu.override.yml \
        compose.server.override.yml
      ;;
    *)
      echo "Unknown COMPOSE_STACK='$COMPOSE_STACK' (cpu-pilot | gpu-l4 | gpu-l4-8gb)" >&2
      return 1
      ;;
  esac
}

compose_files() {
  echo "$DEPLOY_DIR/compose.yml"
  local f
  while IFS= read -r f; do
    echo "$DEPLOY_DIR/$f"
  done < <(stack_override_files)
}

compose_prod() {
  resolve_docker
  local file
  local args=("${DOCKER_BIN[@]}" compose --env-file "$ENV_FILE")
  while IFS= read -r file; do
    args+=(-f "$file")
  done < <(compose_files)
  args+=("$@")
  "${args[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-run}" in
    files)
      compose_files
      ;;
    stack)
      echo "$COMPOSE_STACK"
      ;;
    run)
      shift
      compose_prod "$@"
      ;;
    *)
      echo "Usage: compose-stack.sh [files|stack|run] [docker compose args...]" >&2
      exit 1
      ;;
  esac
fi
