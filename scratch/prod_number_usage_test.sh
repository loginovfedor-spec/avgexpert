#!/usr/bin/env bash
set -euo pipefail
source /opt/avgexpert/avgexpert/deploy/prod/.env
BASE_URL="${BASE_URL:-http://127.0.0.1:8200}"

ADMIN_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${AVGEXPERT_ADMIN_PASSWORD}\"}")
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "=== request_cost_log for Number ==="
sudo docker compose -f /opt/avgexpert/avgexpert/deploy/prod/compose.yml --env-file /opt/avgexpert/avgexpert/deploy/prod/.env exec -T postgres \
  psql -U avg -d avgexpert -tAc "SELECT COUNT(*) FROM request_cost_log WHERE username='Number';"

sudo docker compose -f /opt/avgexpert/avgexpert/deploy/prod/compose.yml --env-file /opt/avgexpert/avgexpert/deploy/prod/.env exec -T postgres \
  psql -U avg -d avgexpert -tAc "SELECT created_at, cost_usd, provider_id, model_name FROM request_cost_log WHERE username='Number' ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || true

echo "=== stream chat category=Number ==="
curl -fsS -N -X POST "${BASE_URL}/api/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"category":"Number","stream":true,"messages":[{"role":"user","content":"Скажи test-ok"}]}' | head -c 600
echo
