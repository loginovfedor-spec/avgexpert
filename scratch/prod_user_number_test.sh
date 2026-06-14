#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8200}"
ADMIN_PASS="${AVGEXPERT_ADMIN_PASSWORD:?AVGEXPERT_ADMIN_PASSWORD required}"
TEST_USER="${TEST_USER:-Number}"
TEST_PASS="${TEST_PASS:-}"

echo "=== prod user test: ${TEST_USER} @ ${BASE_URL} ==="

echo "[1] health"
curl -fsS "${BASE_URL}/health" | head -c 200
echo

echo "[2] admin login"
ADMIN_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\"}")
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: admin login"
  exit 1
fi
echo "OK: admin token"

if [[ -z "$TEST_PASS" ]]; then
  echo "[3] skip user login (TEST_PASS unset)"
  echo "Set TEST_PASS to test Number user chat"
  exit 0
fi

echo "[3] user login: ${TEST_USER}"
USER_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}" || true)
USER_TOKEN=$(echo "$USER_JSON" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [[ -z "$USER_TOKEN" ]]; then
  echo "FAIL: user login"
  echo "$USER_JSON"
  exit 1
fi
echo "OK: user token"

echo "[4] categories for user"
CATS=$(curl -fsS "${BASE_URL}/api/users/categories" \
  -H "Authorization: Bearer ${USER_TOKEN}")
echo "$CATS" | head -c 500
echo

echo "[5] chat completion (category=Number, stream=false)"
CHAT_RES=$(curl -fsS -w '\nHTTP:%{http_code}' -X POST "${BASE_URL}/api/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -d '{"category":"Number","stream":false,"messages":[{"role":"user","content":"Ответь одним словом: test-ok"}]}' || true)
echo "$CHAT_RES" | tail -c 800
