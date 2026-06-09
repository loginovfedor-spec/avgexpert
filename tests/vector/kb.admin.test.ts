import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.EMBEDDING_MOCK = 'true';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

const { app } = require('../../server');
const db = require('../../src/core/sqlite');

test('Admin KB ingest API', async (t) => {
  let adminToken = '';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-admin-'));
  const allowedDir = path.join(tmpDir, 'allowed');
  fs.mkdirSync(allowedDir, { recursive: true });
  fs.writeFileSync(
    path.join(allowedDir, 'admin-sample.md'),
    '# Глава 1\n\nТекст admin ingest.\n',
    'utf-8'
  );
  const prevAllowedDir = process.env.KB_INGEST_ALLOWED_DIR;
  process.env.KB_INGEST_ALLOWED_DIR = allowedDir;

  t.after(() => {
    process.env.KB_INGEST_ALLOWED_DIR = prevAllowedDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    db.close();
  });

  await t.test('setup admin login', async () => {
    const adminPass = 'TestAdminPass123!';
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: adminPass })
      .expect(200);

    adminToken = res.body.access_token;
    assert.ok(adminToken);
  });

  await t.test('POST /api/admin/kb/documents rejects path outside allowed dir', async () => {
    const res = await request(app)
      .post('/api/admin/kb/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ filePath: '../../../etc/passwd', scope: 'global' })
      .expect(500);

    assert.ok(res.body.detail || res.body.error);
  });

  await t.test('POST /api/admin/kb/documents rejects http source_uri', async () => {
    const res = await request(app)
      .post('/api/admin/kb/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filePath: 'admin-sample.md',
        sourceUri: 'http://example.com/doc.md',
      })
      .expect(400);

    assert.match(res.body.detail, /SSRF/i);
  });

  const RUN_PG = process.env.SKIP_PG_INTEGRATION !== 'true';
  await t.test(
    'POST /api/admin/kb/documents ingests global document',
    { skip: !RUN_PG },
    async () => {
      const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
      if (!resolvePgConnectionString()) {
        t.skip('DATABASE_URL не найден');
        return;
      }

      const res = await request(app)
        .post('/api/admin/kb/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          filePath: 'admin-sample.md',
          title: 'Admin ingest test',
          scope: 'global',
          docType: 'test',
        })
        .expect(201);

      assert.equal(res.body.status, 'ready');
      assert.ok(res.body.docId);
      assert.ok(res.body.chunkCount >= 1);
    }
  );
});
