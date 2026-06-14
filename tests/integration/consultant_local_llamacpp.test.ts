import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import '../helpers/test-env';
import { ensureTestPg, teardownTestPg } from '../helpers/pg_harness';
import { getDatabasePort } from '../../src/core/pg';
import { upsertTestUser, setTestPassword } from '../helpers/test_users';
import { app, server } from '../helpers/server';

const LLAMA_HEALTH_URL = process.env.LOCAL_LLAMA_HEALTH_URL || 'http://127.0.0.1:8201/health';
const CATEGORY_NAME = 'Консультант (Local)';

async function isLlamaOnline(): Promise<boolean> {
  try {
    const response = await fetch(LLAMA_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

test('Consultant (Local) category is configured for llamacpp + consultant tier', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }
  await ensureTestPg();
  const db = getDatabasePort();
  const row = await db.get<{
    provider: string;
    model_name: string;
    rag_allowed: boolean;
    retrieval_tier: string;
    input_context_max: number;
    max_tokens: number;
  }>(
    `
      SELECT provider, model_name, rag_allowed, retrieval_tier, input_context_max, max_tokens
      FROM categories WHERE name = @name
    `,
    { name: CATEGORY_NAME }
  );

  assert.ok(row, `category ${CATEGORY_NAME} must exist (PG seed)`);
  assert.strictEqual(row.provider, 'llamacpp');
  assert.strictEqual(row.model_name, 'qwen2.5-7b-instruct');
  assert.strictEqual(row.rag_allowed, true);
  assert.strictEqual(row.retrieval_tier, 'consultant');
  assert.strictEqual(row.input_context_max, 16384);
  assert.strictEqual(row.max_tokens, 1024);
  await teardownTestPg();
});

test('Consultant (Local) chat completion via gateway', async (t) => {
  if (!(await isLlamaOnline())) {
    t.skip('Llama.cpp is offline — start with: npm run local:up');
    return;
  }
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  await ensureTestPg();
  const username = 'consultant_local_itest';

  t.after(async () => {
    if (server) server.close();
    await teardownTestPg();
  });

  await setTestPassword(username, 'ConsultLocal123!');
  await upsertTestUser(username, {
    category: CATEGORY_NAME,
    token_version: 1,
    tokens_allocated: 1000000,
    rag_enabled: true,
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username, password: 'ConsultLocal123!' })
    .expect(200);

  const token = login.body.access_token;
  assert.ok(token);

  const res = await request(app)
    .post('/api/chat/completions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      messages: [{ role: 'user', content: 'Ответь одним словом: да' }],
      category: CATEGORY_NAME,
    })
    .expect(200);

  assert.ok(res.body.choices?.[0]?.message?.content);
});
