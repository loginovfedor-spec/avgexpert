#!/usr/bin/env bash
# D6 pilot acceptance — run on L4 server (or via npm run prod:acceptance / prod:ssh-acceptance)
#
# Usage:
#   bash deploy/prod/scripts/pilot-acceptance.sh
#   bash deploy/prod/scripts/pilot-acceptance.sh --skip-resilience
#   bash deploy/prod/scripts/pilot-acceptance.sh --migrate-rag
set -euo pipefail

SKIP_RESILIENCE=false
MIGRATE_RAG=false
for arg in "$@"; do
  case "$arg" in
    --skip-resilience) SKIP_RESILIENCE=true ;;
    --migrate-rag) MIGRATE_RAG=true ;;
    -h|--help)
      echo "Usage: pilot-acceptance.sh [--skip-resilience] [--migrate-rag]"
      exit 0
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/prod/compose.yml"
ENV_FILE="$ROOT/deploy/prod/.env"
PASS=0
FAIL=0

log_pass() { echo "[PASS] $*"; PASS=$((PASS + 1)); }
log_fail() { echo "[FAIL] $*" >&2; FAIL=$((FAIL + 1)); }
log_step() { echo ""; echo "=== $* ==="; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

app_exec() {
  compose exec -T app "$@"
}

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

cd "$ROOT"

log_step "D6-1 — stack + WEB"
if compose ps --status running 2>/dev/null | grep -q avgexpert-gateway; then
  log_pass "app container running"
else
  log_fail "app container not running"
fi

if compose ps --status running 2>/dev/null | grep -qE 'avgexpert-nginx|nginx'; then
  log_pass "nginx container running"
else
  log_fail "nginx container not running"
fi

HEALTH_LOCAL="$(curl -fsS http://127.0.0.1:8200/health 2>/dev/null || true)"
if [[ -n "$HEALTH_LOCAL" ]]; then
  log_pass "GET /health on :8200"
else
  log_fail "GET /health on :8200"
fi

PUBLIC_URL="${PUBLIC_BASE_URL:-}"
if [[ -z "$PUBLIC_URL" && -n "${PUBLIC_DOMAIN:-}" ]]; then
  PUBLIC_URL="https://${PUBLIC_DOMAIN}"
fi

if [[ -n "$PUBLIC_URL" ]]; then
  if curl -fsSk --connect-timeout 10 "${PUBLIC_URL}/health" >/dev/null 2>&1; then
    log_pass "WEB HTTPS ${PUBLIC_URL}/health"
  elif curl -fsS --connect-timeout 10 "http://${PUBLIC_DOMAIN:-127.0.0.1}/health" >/dev/null 2>&1; then
    log_pass "WEB HTTP (HTTPS not configured yet)"
  else
    log_fail "WEB unreachable at ${PUBLIC_URL}"
  fi
else
  if curl -fsS --connect-timeout 5 "http://127.0.0.1/health" >/dev/null 2>&1; then
    log_pass "WEB HTTP on :80"
  else
    log_fail "PUBLIC_BASE_URL unset and :80 /health failed"
  fi
fi

log_step "D6-2 — RAG smoke"
if [[ "$MIGRATE_RAG" == true ]]; then
  if bash "$ROOT/deploy/prod/scripts/migrate-rag-db.sh"; then
    log_pass "RAG migrate-rag-db.sh"
  else
    log_fail "RAG migrate-rag-db.sh"
  fi
fi

for cmd in kb:pg:migrate kb:pg:smoke embedding:smoke; do
  if app_exec npm run "$cmd"; then
    log_pass "npm run $cmd"
  else
    log_fail "npm run $cmd"
  fi
done

CHUNK_COUNT="$(compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
  "SELECT COUNT(*) FROM kb_chunks" 2>/dev/null | tr -d '[:space:]' || echo 0)"
if [[ "${CHUNK_COUNT:-0}" -gt 0 ]]; then
  log_pass "kb_chunks count=${CHUNK_COUNT}"
else
  log_fail "kb_chunks empty (run prod:migrate-rag or kb:reindex-books)"
fi

log_step "D6-3 — admin + pilot test users"
if app_exec npm run prod:seed-pilot-users; then
  log_pass "prod:seed-pilot-users"
else
  log_fail "prod:seed-pilot-users"
fi

ADMIN_PASS="${AVGEXPERT_ADMIN_PASSWORD:-}"
if [[ -n "$ADMIN_PASS" ]]; then
  LOGIN_BODY="$(curl -fsS -X POST http://127.0.0.1:8200/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\"}" 2>/dev/null || true)"
  if echo "$LOGIN_BODY" | grep -q access_token; then
    log_pass "admin login"
    ADMIN_TOKEN="$(echo "$LOGIN_BODY" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
  else
    log_fail "admin login"
    ADMIN_TOKEN=""
  fi

  TEST_PASS="${PILOT_TEST_PASSWORD:-PilotTest2026!}"
  PILOT_LOGIN="$(curl -fsS -X POST http://127.0.0.1:8200/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"pilot_consultant\",\"password\":\"${TEST_PASS}\"}" 2>/dev/null || true)"
  if echo "$PILOT_LOGIN" | grep -q access_token; then
    log_pass "pilot_consultant login (role: Консультант)"
  else
    log_fail "pilot_consultant login"
  fi
else
  log_fail "AVGEXPERT_ADMIN_PASSWORD unset in .env"
  ADMIN_TOKEN=""
fi

log_step "D6-4 — /health vector + admin RAG metrics"
if echo "$HEALTH_LOCAL" | grep -q '"store":"ok"'; then
  log_pass "vector.store=ok"
elif echo "$HEALTH_LOCAL" | grep -q '"store":"degraded"'; then
  log_pass "vector.store=degraded (acceptable for acceptance)"
else
  log_fail "vector.store not ok/degraded"
fi

if echo "$HEALTH_LOCAL" | grep -qE '"embedder":"ok"|"embedder":"degraded"'; then
  log_pass "vector.embedder reachable"
else
  log_fail "vector.embedder unavailable"
fi

if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  DASH="$(curl -fsS http://127.0.0.1:8200/api/admin/dashboard/mvp \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" 2>/dev/null || true)"
  if echo "$DASH" | grep -q rag_metrics; then
    log_pass "admin dashboard rag_metrics present"
    P95="$(echo "$DASH" | sed -n 's/.*"p95":\([0-9.]*\).*/\1/p' | head -1)"
    if [[ -n "$P95" ]]; then
      echo "       rag_latency_ms.p95=${P95} (NFR-1 target < 300 ms on GPU)"
    fi
  else
    log_fail "admin dashboard rag_metrics missing"
  fi
else
  log_fail "skipped admin dashboard (no admin token)"
fi

if app_exec npm run load:rag-retrieval -- --rounds=2 --concurrency=4; then
  log_pass "load:rag-retrieval p95 gate"
else
  log_fail "load:rag-retrieval p95 > 300 ms or error"
fi

log_step "D6-5 — resilience (restart app + postgres)"
if [[ "$SKIP_RESILIENCE" == true ]]; then
  echo "[SKIP] resilience (--skip-resilience)"
else
  BEFORE_COUNT="$CHUNK_COUNT"
  USER_COUNT_BEFORE="$(compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
    "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo 0)"

  compose restart app
  sleep 5
  if curl -fsS http://127.0.0.1:8200/ready >/dev/null 2>&1; then
    log_pass "app restart → /ready"
  else
    log_fail "app restart → /ready"
  fi

  compose restart postgres
  echo "Waiting for postgres..."
  for _ in $(seq 1 30); do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  compose up -d app

  AFTER_COUNT="$(compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
    "SELECT COUNT(*) FROM kb_chunks" 2>/dev/null | tr -d '[:space:]' || echo 0)"
  USER_COUNT_AFTER="$(compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
    "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo 0)"

  if [[ "$BEFORE_COUNT" == "$AFTER_COUNT" && "$BEFORE_COUNT" -gt 0 ]]; then
    log_pass "kb_chunks preserved after restart (${AFTER_COUNT})"
  else
    log_fail "kb_chunks changed: ${BEFORE_COUNT} → ${AFTER_COUNT}"
  fi

  if [[ "$USER_COUNT_BEFORE" == "$USER_COUNT_AFTER" && "$USER_COUNT_AFTER" -gt 0 ]]; then
    log_pass "users preserved after restart (${USER_COUNT_AFTER})"
  else
    log_fail "users changed: ${USER_COUNT_BEFORE} → ${USER_COUNT_AFTER}"
  fi
fi

log_step "D6-6 — sign-off checklist"
echo "See deploy/prod/PILOT_ACCEPTANCE.md §7 — mark items and sign after review."
echo "  Sign-off: _______________  Date: _______________"

echo ""
echo "=== Summary: ${PASS} passed, ${FAIL} failed ==="
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "Pilot acceptance PASS."
