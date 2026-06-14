#!/usr/bin/env bash
# Fix Number user chat on prod: credits + model_name
set -euo pipefail
source /opt/avgexpert/avgexpert/deploy/prod/.env
COMPOSE="sudo docker compose -f /opt/avgexpert/avgexpert/deploy/prod/compose.yml --env-file /opt/avgexpert/avgexpert/deploy/prod/.env"

echo "=== before ==="
$COMPOSE exec -T postgres psql -U avg -d avgexpert -tAc \
  "SELECT 'user', username, input_context_credits, output_generation_credits FROM users WHERE username='Number';"
$COMPOSE exec -T postgres psql -U avg -d avgexpert -tAc \
  "SELECT 'cat', name, provider, model_name, input_context_default, input_context_max FROM categories WHERE name='Number';"

echo "=== apply fix ==="
$COMPOSE exec -T postgres psql -U avg -d avgexpert -v ON_ERROR_STOP=1 <<'SQL'
-- Снять искусственно низкие лимиты (1 credit = 1000 токенов) — использовать дефолты категории
UPDATE users
SET input_context_credits = NULL,
    output_generation_credits = NULL,
    n_ctx = 32768
WHERE username = 'Number';

UPDATE categories
SET model_name = 'gpt-4.1',
    provider = 'openai_gpt4_1_Number',
    input_context_default = 1000000,
    input_context_max = 1000000,
    max_tokens = 32768
WHERE name = 'Number';
SQL

echo "=== after ==="
$COMPOSE exec -T postgres psql -U avg -d avgexpert -tAc \
  "SELECT 'user', username, input_context_credits, output_generation_credits, n_ctx FROM users WHERE username='Number';"
$COMPOSE exec -T postgres psql -U avg -d avgexpert -tAc \
  "SELECT 'cat', name, provider, model_name, input_context_max, max_tokens FROM categories WHERE name='Number';"

echo "=== verify chat (admin, category Number, RAG-sized prompt) ==="
ADMIN_JSON=$(curl -fsS -X POST http://127.0.0.1:8200/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${AVGEXPERT_ADMIN_PASSWORD}\"}")
ADMIN_TOKEN=$(echo "$ADMIN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# ~1500 tokens of filler to mimic RAG context
FILLER=$(python3 -c "print('контекст ' * 400)")
PAYLOAD=$(python3 -c "import json; print(json.dumps({'category':'Number','stream':false,'messages':[{'role':'user','content':'$FILLER\\n\\nВопрос: скажи test-ok'}]}))")

code=$(curl -s -o /tmp/fix_chat.json -w '%{http_code}' -X POST http://127.0.0.1:8200/api/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d "$PAYLOAD")
echo "HTTP $code"
head -c 400 /tmp/fix_chat.json
echo
