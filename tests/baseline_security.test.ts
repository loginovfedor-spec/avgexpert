import './helpers/test-env';
import test, { after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app, server } from './helpers/server';
import { teardownTestPg } from './helpers/pg_harness';

after(async () => {
  if (server) server.close();
  await teardownTestPg();
});

test('Security Baseline: CORS enforcement', async () => {
  await request(app).get('/api/health').set('Origin', '');

  const res1 = await request(app).get('/api/auth/me').set('Origin', 'http://malicious.com');

  assert.strictEqual(res1.status, 403);
  assert.ok(res1.body.error.message.includes('CORS policy violation'));
});

test('Security Baseline: CORS allows development LAN origin on server port', async () => {
  const res = await request(app).get('/health').set('Origin', 'http://192.168.1.55:8200');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['access-control-allow-origin'], 'http://192.168.1.55:8200');
});

test('Security Baseline: CORS allows RoboKassa callback origins only on payment callbacks', async () => {
  const success = await request(app)
    .post('/api/payments/robokassa/success')
    .set('Origin', 'https://auth.robokassa.ru');

  assert.strictEqual(success.status, 302);
  assert.strictEqual(success.headers['access-control-allow-origin'], 'https://auth.robokassa.ru');

  const unrelated = await request(app).get('/api/auth/me').set('Origin', 'https://auth.robokassa.ru');

  assert.strictEqual(unrelated.status, 403);
});

test('Security Baseline: JSON Payload limit', async () => {
  const largePayload = 'a'.repeat(2.1 * 1024 * 1024);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ data: largePayload })
    .set('Content-Type', 'application/json');

  assert.strictEqual(res.status, 413);
});

test('Security Baseline: API Fallback', async () => {
  const res = await request(app).get('/api/v1/non-existent-route');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'not_found');
  assert.strictEqual(res.body.error.message, 'API route not found');
});

test('Security Baseline: Static files serve index.html for unknown routes', async () => {
  const res = await request(app).get('/some-page');
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes('<!DOCTYPE html>'));
});
