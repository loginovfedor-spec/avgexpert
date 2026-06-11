const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');

const LLAMA_HEALTH_URL = process.env.LOCAL_LLAMA_HEALTH_URL || 'http://127.0.0.1:8201/health';
const CATEGORY_NAME = 'Консультант (Local)';

process.env.NODE_ENV = 'test';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

async function isLlamaOnline() {
  try {
    const response = await fetch(LLAMA_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

test('Consultant (Local) category is configured for llamacpp + consultant tier', async () => {
  const db = require('../../src/core/sqlite');
  const row = db.prepare(`
    SELECT provider, model_name, rag_allowed, retrieval_tier, input_context_max, max_tokens
    FROM categories WHERE name = ?
  `).get(CATEGORY_NAME);

  assert.ok(row, `category ${CATEGORY_NAME} must exist (migration v030)`);
  assert.strictEqual(row.provider, 'llamacpp');
  assert.strictEqual(row.model_name, 'qwen2.5-7b-instruct');
  assert.strictEqual(row.rag_allowed, 1);
  assert.strictEqual(row.retrieval_tier, 'consultant');
  assert.strictEqual(row.input_context_max, 16384);
  assert.strictEqual(row.max_tokens, 1024);
});

test('Consultant (Local) chat completion via gateway', async (t) => {
  if (!(await isLlamaOnline())) {
    t.skip('Llama.cpp is offline — start with: npm run local:up');
    return;
  }

  const { app, server } = require('../../server');
  const db = require('../../src/core/sqlite');
  const username = 'consultant_local_itest';

  t.after(() => {
    if (server) server.close();
    db.close();
  });

  const hash = bcrypt.hashSync('ConsultLocal123!', 10);
  db.prepare(`
    INSERT OR REPLACE INTO users (
      username, password_hash, category, token_version, tokens_allocated, rag_enabled
    ) VALUES (?, ?, ?, 1, 1000000, 1)
  `).run(username, hash, CATEGORY_NAME);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username, password: 'ConsultLocal123!' })
    .expect(200);

  const token = login.body.access_token;
  assert.ok(token);

  const health = await request(app)
    .get(`/api/providers/llamacpp/health`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(health.body.status, 'online');

  const chat = await request(app)
    .post('/api/chat/completions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      category: CATEGORY_NAME,
      stream: false,
      messages: [{ role: 'user', content: 'Ответь одним словом: привет' }],
    })
    .expect(200);

  const text = chat.body?.choices?.[0]?.message?.content || '';
  assert.ok(String(text).trim().length > 0, 'expected non-empty assistant reply');
});
