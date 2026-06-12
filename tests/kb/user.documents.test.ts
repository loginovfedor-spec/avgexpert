import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';

process.env.NODE_ENV = 'test';
process.env.EMBEDDING_MOCK = 'true';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

import { app } from '../helpers/server';
import { upsertTestUser, setTestPassword } from '../helpers/test_users';
import { ensureTestPg, teardownTestPg } from '../helpers/pg_harness';
test('User KB documents API', async (t) => {
  let tokenA = '';
  let tokenB = '';
  const pass = 'TestUserPass123!';

  t.before(async () => {
    await ensureTestPg();
  });

  t.after(async () => {
    await teardownTestPg();
  });

  await t.test('setup users', async () => {
    await upsertTestUser('user_a', { category: 'Консультант', n_ctx: 4096 });
    await upsertTestUser('user_b', { category: 'Консультант', n_ctx: 4096 });
    await setTestPassword('user_a', pass);
    await setTestPassword('user_b', pass);

    const resA = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user_a', password: pass })
      .expect(200);
    tokenA = resA.body.access_token;

    const resB = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user_b', password: pass })
      .expect(200);
    tokenB = resB.body.access_token;
  });

  await t.test('POST /api/user/documents requires auth', async () => {
    await request(app)
      .post('/api/user/documents')
      .send({ filename: 'x.txt', content: 'hi' })
      .expect(401);
  });

  await t.test('POST /api/user/documents rejects http source_uri', async () => {
    const ssrfRes = await request(app)
      .post('/api/user/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        filename: 'ok.txt',
        content: 'hello',
        sourceUri: 'https://evil.example/doc.txt',
      })
      .expect(400);
    assert.match(ssrfRes.body.detail, /SSRF/i);
  });

  const RUN_PG = process.env.SKIP_PG_INTEGRATION !== 'true';
  let docIdA = '';

  await t.test(
    'POST /api/user/documents accepts pdf and docx extracted text',
    { skip: !RUN_PG },
    async () => {
      const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
      if (!resolvePgConnectionString()) {
        t.skip('DATABASE_URL не найден');
        return;
      }

      const pdfRes = await request(app)
        .post('/api/user/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ filename: 'report.pdf', content: 'Extracted PDF chapter text for indexing.' })
        .expect(201);
      assert.equal(pdfRes.body.filename, 'report.pdf');

      const docxRes = await request(app)
        .post('/api/user/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ filename: 'notes.docx', content: 'Extracted DOCX body for indexing.' })
        .expect(201);
      assert.equal(docxRes.body.filename, 'notes.docx');

      await request(app)
        .delete(`/api/user/documents/${pdfRes.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      await request(app)
        .delete(`/api/user/documents/${docxRes.body.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    }
  );

  await t.test(
    'POST/GET/DELETE /api/user/documents with tenant isolation',
    { skip: !RUN_PG },
    async () => {
      const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
      if (!resolvePgConnectionString()) {
        t.skip('DATABASE_URL не найден');
        return;
      }

      const uploadRes = await request(app)
        .post('/api/user/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          filename: 'my-notes.md',
          content: '# Notes\n\nPrivate content for user A.',
          title: 'My Notes',
        })
        .expect(201);

      docIdA = uploadRes.body.id;
      assert.equal(uploadRes.body.status, 'ready');
      assert.ok(uploadRes.body.chunkCount >= 1);

      const listA = await request(app)
        .get('/api/user/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      assert.ok(listA.body.documents.some((d: { id: string }) => d.id === docIdA));

      const listB = await request(app)
        .get('/api/user/documents')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      assert.equal(listB.body.documents.some((d: { id: string }) => d.id === docIdA), false);

      await request(app)
        .get(`/api/user/documents/${docIdA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app)
        .delete(`/api/user/documents/${docIdA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app)
        .delete(`/api/user/documents/${docIdA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const listAfter = await request(app)
        .get('/api/user/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      assert.equal(listAfter.body.documents.some((d: { id: string }) => d.id === docIdA), false);
    }
  );
});
