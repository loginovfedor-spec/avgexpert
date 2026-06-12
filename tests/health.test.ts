import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import bcrypt from 'bcrypt';
import './helpers/test-env';
import { app, server } from './helpers/server';
import { upsertTestUser } from './helpers/test_users';
import { ensureTestPg, teardownTestPg } from './helpers/pg_harness';
import { DEFAULT_CATEGORY_PARAMS } from '../src/core/config';

test('Provider Health Endpoint', async (t) => {
  let token = '';
  const username = 'healthtestuser';
  const password = 'HealthPass123!';

  t.before(async () => {
    await ensureTestPg();
  });

  t.after(async () => {
    if (server) server.close();
    await teardownTestPg();
  });

  await t.test('Setup: Create user and login', async () => {
    const hash = bcrypt.hashSync(password, 10);
    await upsertTestUser(username, {
      password_hash: hash,
      category: 'Консультант',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);

    token = res.body.access_token;
    assert.ok(token);
  });

  await t.test('GET /api/providers/health - should return status', async () => {
    const res = await request(app)
      .get('/api/providers/health')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.ok(res.body.status === 'online' || res.body.status === 'offline');
    assert.strictEqual(res.body.provider, DEFAULT_CATEGORY_PARAMS.provider);
  });

  await t.test('GET /health - should include vector section', async () => {
    const res = await request(app).get('/health').expect(200);

    assert.strictEqual(res.body.status, 'ok');
    assert.ok(res.body.vector);
    assert.ok(['ok', 'degraded', 'unavailable'].includes(res.body.vector.store));
    assert.ok(['ok', 'degraded', 'unavailable'].includes(res.body.vector.embedder));
    assert.ok(typeof res.body.vector.namespace === 'string');
    assert.ok(Number.isFinite(res.body.vector.dimensions));
  });
});
