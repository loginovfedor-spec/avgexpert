#!/usr/bin/env bash
set -euo pipefail
source /opt/avgexpert/avgexpert/deploy/prod/.env

BASE_URL="${BASE_URL:-http://127.0.0.1:8200}"

ADMIN_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${AVGEXPERT_ADMIN_PASSWORD}\"}")
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "=== Number user (admin view) ==="
curl -fsS "${BASE_URL}/api/admin/users" -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | python3 -c "import sys,json; u=json.load(sys.stdin).get('Number',{}); print(json.dumps({k:v for k,v in u.items() if k!='password_hash'}, ensure_ascii=False, indent=2))"

echo "=== chat category=Number (admin token) ==="
CHAT=$(curl -fsS -X POST "${BASE_URL}/api/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"category":"Number","stream":false,"messages":[{"role":"user","content":"Ответь одним словом: test-ok"}]}')
echo "$CHAT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('content:', (d.get('choices') or [{}])[0].get('message',{}).get('content','')[:300]); print('usage:', d.get('usage')); err=d.get('error') or d.get('detail'); print('error:', err) if err else None"

if [[ -n "${TEST_PASS:-}" ]]; then
  echo "=== login as Number ==="
  USER_JSON=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"Number\",\"password\":\"${TEST_PASS}\"}")
  USER_TOKEN=$(echo "$USER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
  echo "OK: Number login"

  echo "=== categories for Number ==="
  curl -fsS "${BASE_URL}/api/users/categories" -H "Authorization: Bearer ${USER_TOKEN}" | python3 -m json.tool | head -40

  echo "=== chat as Number ==="
  CHAT2=$(curl -fsS -X POST "${BASE_URL}/api/chat/completions" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${USER_TOKEN}" \
    -d '{"category":"Number","stream":false,"messages":[{"role":"user","content":"Ответь одним словом: test-ok"}]}')
  echo "$CHAT2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('content:', (d.get('choices') or [{}])[0].get('message',{}).get('content','')[:300]); print('usage:', d.get('usage')); err=d.get('error') or d.get('detail'); print('error:', err) if err else None"
fi
