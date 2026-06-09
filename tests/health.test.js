const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');

// Set env for tests
process.env.NODE_ENV = 'test';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

const { app, server } = require('../server');
const db = require('../src/core/sqlite');

test('Provider Health Endpoint', async (t) => {
  let token = '';
  const username = 'healthtestuser';
  const password = 'HealthPass123!';

  t.after(() => {
    if (server) server.close();
    db.close();
  });

  await t.test('Setup: Create user and login', async () => {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT OR REPLACE INTO users (username, password_hash, category, token_version) VALUES (?, ?, ?, ?)').run(
      username, hash, 'Консультант', 1
    );

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
    const { DEFAULT_CATEGORY_PARAMS } = require('../src/core/config');
    assert.strictEqual(res.body.provider, DEFAULT_CATEGORY_PARAMS.provider); 
  });

  await t.test('GET /health - should include vector section', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    assert.strictEqual(res.body.status, 'ok');
    assert.ok(res.body.vector);
    assert.ok(['ok', 'degraded', 'unavailable'].includes(res.body.vector.store));
    assert.ok(['ok', 'degraded', 'unavailable'].includes(res.body.vector.embedder));
    assert.ok(typeof res.body.vector.namespace === 'string');
    assert.ok(Number.isFinite(res.body.vector.dimensions));
  });
});
