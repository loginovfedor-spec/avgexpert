#!/usr/bin/env bash
set -euo pipefail
source /opt/avgexpert/avgexpert/deploy/prod/.env
ADMIN_JSON=$(curl -fsS -X POST http://127.0.0.1:8200/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${AVGEXPERT_ADMIN_PASSWORD}\"}")
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

code=$(curl -s -o /tmp/nchat.json -w '%{http_code}' -X POST http://127.0.0.1:8200/api/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"category":"Number","stream":false,"messages":[{"role":"user","content":"Скажи test-ok"}]}')
echo "simple chat HTTP $code"
python3 -c "import json; d=json.load(open('/tmp/nchat.json')); print('content:', (d.get('choices') or [{}])[0].get('message',{}).get('content','')[:200]); e=d.get('error') or d.get('detail'); print('error:', e) if e else None"
