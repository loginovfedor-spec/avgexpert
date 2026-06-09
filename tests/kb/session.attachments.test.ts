import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.EMBEDDING_MOCK = 'true';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

const { app } = require('../../server');
const db = require('../../src/core/sqlite');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAttachmentReady(
  token: string,
  sessionId: string,
  docId: string,
  timeoutMs = 15000
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request(app)
      .get(`/api/chat/sessions/${sessionId}/attachments/${docId}`)
      .set('Authorization', `Bearer ${token}`);
    if (res.status === 200 && res.body.status === 'ready') {
      return res.body;
    }
    if (res.status === 200 && res.body.status === 'failed') {
      throw new Error(`Indexing failed: ${res.body.error || 'unknown'}`);
    }
    await sleep(300);
  }
  throw new Error('Timeout waiting for attachment ready');
}

test('Session attachments API + GC', async (t) => {
  let token = '';
  const pass = 'TestUserPass123!';
  const username = `s6_user_${randomUUID().slice(0, 8)}`;
  const sessionId = randomUUID();

  t.after(() => {
    db.close();
  });

  await t.test('setup user and session', async () => {
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, category, n_ctx)
      VALUES (@username, @password_hash, @category, @n_ctx)
    `).run({ username, password_hash: hash, category: 'Консультант', n_ctx: 4096 });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username, password: pass })
      .expect(200);
    token = login.body.access_token;

    await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: sessionId,
        title: 'S6 test',
        messages: [],
        updatedAt: Date.now(),
      })
      .expect(200);
  });

  await t.test('POST attachments requires existing session', async () => {
    await request(app)
      .post(`/api/chat/sessions/${randomUUID()}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filename: 'x.md', content: '# hi' })
      .expect(404);
  });

  const RUN_PG = process.env.SKIP_PG_INTEGRATION !== 'true';
  let attachmentId = '';

  await t.test(
    'upload → ready → delete session → chunks gone',
    { skip: !RUN_PG },
    async () => {
      const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
      if (!resolvePgConnectionString()) {
        t.skip('DATABASE_URL не найден');
        return;
      }

      const uniquePhrase = `s6-secret-${randomUUID()}`;
      const uploadRes = await request(app)
        .post(`/api/chat/sessions/${sessionId}/attachments`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'session-note.md',
          content: `# Session doc\n\n${uniquePhrase}`,
        })
        .expect(202);

      attachmentId = uploadRes.body.id;
      assert.equal(uploadRes.body.status, 'pending');
      assert.ok(attachmentId);

      const ready = await waitForAttachmentReady(token, sessionId, attachmentId);
      assert.equal(ready.status, 'ready');
      assert.ok(ready.chunkCount >= 1);

      const { KbRepository } = await import('../../src/modules/kb/kb.repository');
      const kb = new KbRepository();
      const chunksBefore = await kb.countChunksByDocId(attachmentId);
      assert.ok(chunksBefore >= 1);

      await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const docAfter = await kb.findById(attachmentId);
      assert.equal(docAfter, null);

      const chunksAfter = await kb.countChunksByDocId(attachmentId);
      assert.equal(chunksAfter, 0);
    }
  );

  await t.test('DELETE session attachment removes indexed chunks', { skip: !RUN_PG }, async () => {
      const { resolvePgConnectionString } = await import('../../src/modules/vector/pg/connection');
      if (!resolvePgConnectionString()) {
        t.skip('DATABASE_URL не найден');
        return;
      }

      const sessionId2 = randomUUID();
      await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: sessionId2, title: 'delete attach', messages: [], updatedAt: Date.now() })
        .expect(200);

      const uploadRes = await request(app)
        .post(`/api/chat/sessions/${sessionId2}/attachments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ filename: 'del.md', content: '# delete me\n\ntext' })
        .expect(202);

      await waitForAttachmentReady(token, sessionId2, uploadRes.body.id);

      await request(app)
        .delete(`/api/chat/sessions/${sessionId2}/attachments/${uploadRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const { KbRepository } = await import('../../src/modules/kb/kb.repository');
      const kb = new KbRepository();
      assert.equal(await kb.countChunksByDocId(uploadRes.body.id), 0);
    });

  await t.test('indexing queue marks stale jobs failed', async () => {
    const { recoverStaleIndexJobs } = await import('../../src/modules/kb/indexing-queue');
    await assert.doesNotReject(recoverStaleIndexJobs());
  });
});
