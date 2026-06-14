#!/usr/bin/env bash
set -euo pipefail
source /opt/avgexpert/avgexpert/deploy/prod/.env
BASE_URL="${BASE_URL:-http://127.0.0.1:8200}"

ADMIN_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${AVGEXPERT_ADMIN_PASSWORD}\"}")
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "=== category Number full row ==="
sudo docker compose -f /opt/avgexpert/avgexpert/deploy/prod/compose.yml --env-file /opt/avgexpert/avgexpert/deploy/prod/.env exec -T postgres \
  psql -U avg -d avgexpert -x -c "SELECT * FROM categories WHERE name='Number';"

echo "=== simulate Number user chat (admin sets category in body) ==="
for payload in \
  '{"category":"Number","stream":false,"messages":[{"role":"user","content":"Привет"}]}' \
  '{"stream":false,"messages":[{"role":"user","content":"Привет"}]}' \
  '{"category":"Number","stream":true,"messages":[{"role":"user","content":"Привет"}]}'
do
  echo "--- payload: ${payload:0:80}..."
  code=$(curl -s -o /tmp/chat_out.json -w '%{http_code}' -X POST "${BASE_URL}/api/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -d "$payload")
  echo "HTTP $code"
  head -c 500 /tmp/chat_out.json
  echo
done

if [[ -n "${TEST_PASS:-}" ]]; then
  echo "=== Number user login + chat ==="
  USER_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"Number\",\"password\":\"${TEST_PASS}\"}")
  USER_TOKEN=$(echo "$USER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
  code=$(curl -s -o /tmp/chat_num.json -w '%{http_code}' -X POST "${BASE_URL}/api/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${USER_TOKEN}" \
    -d '{"stream":false,"messages":[{"role":"user","content":"Привет"}]}')
  echo "HTTP $code"
  cat /tmp/chat_num.json
  echo
fi
