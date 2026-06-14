#!/usr/bin/env bash
# Audit deploy/prod/.env and providers (no secret values printed)
set -uo pipefail

if [[ -f "./deploy/prod/.env" ]]; then
  ROOT="$(pwd)"
else
  ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
APP_ENV="$ROOT/deploy/prod/.env"
PROVIDERS="$ROOT/deploy/prod/providers"
PLACEHOLDER_RE='change-me|replace-me|replace-with|sk-replace|your-|example\.com'

mask_val() {
  local v="$1" n=${#1}
  if [[ -z "$v" ]]; then printf 'empty'
  elif [[ "$n" -le 4 ]]; then printf '****'
  else printf '%s…%s (%d chars)' "${v:0:3}" "${v: -2}" "$n"
  fi
}

is_placeholder() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  echo "$v" | grep -qiE "$PLACEHOLDER_RE"
}

issues=0
pissues=0

echo "Host: $(hostname) | GPU: $(command -v nvidia-smi >/dev/null && echo yes || echo no)"
echo ""
echo "=== deploy/prod/.env ==="

[[ -f "$APP_ENV" ]] || { echo "MISSING $APP_ENV"; exit 1; }

# shellcheck disable=SC1090
set -a
source "$APP_ENV"
set +a

if [[ -f "$APP_ENV" ]]; then
  if grep -q $'\r' "$APP_ENV" 2>/dev/null; then
    echo "  WARN deploy/prod/.env has CRLF"
    issues=$((issues + 1))
  fi
fi

for k in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PUBLIC_DOMAIN PUBLIC_BASE_URL \
  AVGEXPERT_ALLOWED_ORIGINS AVGEXPERT_SECRET AVGEXPERT_ADMIN_PASSWORD AVGEXPERT_PORT \
  RAG_V2_ENABLED KNOWLEDGE_GATEWAY_ENABLED VECTOR_STORE COMPOSE_STACK \
  VECTOR_EMBEDDING_CONFIG VECTOR_RERANKER_CONFIG; do
  v="${!k:-}"
  if [[ -z "$v" ]]; then
    echo "  MISSING $k"
    issues=$((issues + 1))
  elif is_placeholder "$v"; then
    echo "  PLACEHOLDER $k=$(mask_val "$v")"
    issues=$((issues + 1))
  else
    echo "  OK $k=$(mask_val "$v")"
  fi
done

gpu=no
command -v nvidia-smi >/dev/null && gpu=yes
stack="${COMPOSE_STACK:-unset}"
echo "  STACK=$stack GPU=$gpu"

if [[ "$gpu" == no && "$stack" != cpu-pilot ]]; then
  echo "  WARN: use COMPOSE_STACK=cpu-pilot without GPU"
  issues=$((issues + 1))
fi

if [[ -n "${PUBLIC_BASE_URL:-}" && -n "${AVGEXPERT_ALLOWED_ORIGINS:-}" ]]; then
  if echo "$AVGEXPERT_ALLOWED_ORIGINS" | grep -qF "$PUBLIC_BASE_URL"; then
    echo "  OK origins include PUBLIC_BASE_URL"
  else
    echo "  WARN PUBLIC_BASE_URL not in AVGEXPERT_ALLOWED_ORIGINS"
    issues=$((issues + 1))
  fi
fi

if [[ "${COMPOSE_STACK:-cpu-pilot}" == cpu-pilot && "${LLAMA_N_GPU_LAYERS:-24}" != "0" ]]; then
  echo "  WARN cpu-pilot but LLAMA_N_GPU_LAYERS=${LLAMA_N_GPU_LAYERS:-?} (recommend 0)"
  issues=$((issues + 1))
fi

if is_placeholder "${PILOT_TEST_PASSWORD:-}"; then
  echo "  WARN PILOT_TEST_PASSWORD unset or placeholder"
  issues=$((issues + 1))
elif [[ -n "${PILOT_TEST_PASSWORD:-}" ]]; then
  echo "  OK PILOT_TEST_PASSWORD=$(mask_val "$PILOT_TEST_PASSWORD")"
fi

if [[ -n "${ROBOKASSA_MERCHANT_LOGIN:-}" ]]; then
  echo "  OK Robokassa merchant set"
  [[ -z "${ROBOKASSA_PASSWORD1:-}" ]] && echo "  WARN ROBOKASSA_PASSWORD1 empty" && issues=$((issues + 1))
  [[ -z "${ROBOKASSA_PASSWORD2:-}" ]] && echo "  WARN ROBOKASSA_PASSWORD2 empty" && issues=$((issues + 1))
else
  echo "  INFO Robokassa not configured"
fi

echo "  deploy issues: $issues"

echo ""
echo "=== root .env (optional) ==="
if [[ -f "$ROOT/.env" ]]; then
  if grep -qE "$PLACEHOLDER_RE" "$ROOT/.env"; then
    echo "  WARN placeholders in root .env"
    issues=$((issues + 1))
  else
    echo "  OK no obvious placeholders"
  fi
  grep -E '^(NODE_ENV|AVGEXPERT_DEPLOY_ENV|RAG_V2_ENABLED)=' "$ROOT/.env" | sed 's/=.*/=***/' || true
else
  echo "  not present (OK for Docker-only prod)"
fi

echo ""
echo "=== providers ==="
shopt -s nullglob
for pf in "$PROVIDERS"/*.env; do
  [[ "$pf" == *.example ]] && continue
  bn=$(basename "$pf")
  # shellcheck disable=SC1090
  set -a
  source "$pf"
  set +a
  if ! grep -qE '^[A-Z_]+=' "$pf" 2>/dev/null; then
    echo "  INVALID $bn not a KEY=VALUE env file"
    pissues=$((pissues + 1))
    continue
  fi
  ad="${ADAPTER_TYPE:-unknown}"
  ad="${ad//$'\r'/}"
  if grep -q $'\r' "$pf" 2>/dev/null; then
    echo "  WARN $bn Windows CRLF line endings"
    pissues=$((pissues + 1))
  fi
  if [[ "$ad" == llamacpp ]]; then
    if [[ -n "${LLAMACPP_URL:-}" ]]; then
      echo "  OK $bn url=${LLAMACPP_URL}"
    else
      echo "  MISSING $bn LLAMACPP_URL"
      pissues=$((pissues + 1))
    fi
    continue
  fi
  key=$(grep -E '^(OPENAI_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|GROK_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY|YANDEX_API_KEY|YANDEX_CLOUD_API_KEY)=' "$pf" | head -1 | cut -d= -f2- | tr -d '"')
  if [[ -z "$key" ]]; then
    echo "  WARN $bn ($ad) no API key"
    pissues=$((pissues + 1))
  elif is_placeholder "$key"; then
    echo "  PLACEHOLDER $bn ($ad)"
    pissues=$((pissues + 1))
  else
    echo "  OK $bn ($ad) key=$(mask_val "$key")"
  fi
done
echo "  provider issues: $pissues"

echo ""
echo "=== gateway container ==="
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q avgexpert-gateway || \
   sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -q avgexpert-gateway; then
  docker_cmd=(docker)
  docker info >/dev/null 2>&1 || docker_cmd=(sudo docker)
  for k in AVGEXPERT_DEPLOY_ENV RAG_V2_ENABLED PUBLIC_BASE_URL VECTOR_EMBEDDING_CONFIG VECTOR_RERANKER_CONFIG; do
    v=$("${docker_cmd[@]}" exec avgexpert-gateway printenv "$k" 2>/dev/null || true)
    if [[ -n "$v" ]]; then
      echo "  OK $k=$(mask_val "$v")"
    else
      echo "  UNSET $k"
    fi
  done
  db=$("${docker_cmd[@]}" exec avgexpert-gateway printenv DATABASE_URL 2>/dev/null || true)
  [[ -n "$db" ]] && echo "  OK DATABASE_URL set ($(mask_val "$db"))" || echo "  WARN DATABASE_URL unset in container"
else
  echo "  gateway not running"
fi

total=$((issues + pissues))
echo ""
echo "TOTAL issues: $total"
exit $([[ "$total" -eq 0 ]] && echo 0 || echo 1)
