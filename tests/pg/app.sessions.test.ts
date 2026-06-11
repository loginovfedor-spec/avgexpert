import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runAppMigrations } from '../../src/core/pg/migrate';
import { seedAppData } from '../../src/core/pg/seed';
import { closePgPools } from '../../src/core/pg/pool';
import { isAppPgEnabled } from '../../src/core/pg/database.port';
import sessionRepository from '../../src/modules/chat/session.repository';
import {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
} from '../../src/modules/providers/llm_response_cache.repository';

test('D3: sessions CRUD on PG (requires DATABASE_URL)', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  await runAppMigrations();
  await seedAppData();

  const sessionId = `d3-${randomUUID()}`;
  const username = 'admin';
  const messages = [{ role: 'user', content: 'hello' }];

  await sessionRepository.save(username, {
    id: sessionId,
    title: 'D3 test',
    messages,
    category: 'Консультант',
    updatedAt: Date.now(),
  });

  const loaded = await sessionRepository.findById(username, sessionId);
  assert.ok(loaded);
  assert.equal(loaded.title, 'D3 test');
  assert.deepEqual(loaded.messages, messages);

  const listed = await sessionRepository.listByUser(username);
  assert.ok(listed.some((row) => row.id === sessionId));

  assert.equal(await sessionRepository.updateTitle(username, sessionId, 'Renamed'), true);
  const renamed = await sessionRepository.findById(username, sessionId);
  assert.equal(renamed?.title, 'Renamed');

  assert.equal(await sessionRepository.delete(username, sessionId), true);
  assert.equal(await sessionRepository.findById(username, sessionId), null);
});

test('D3: llm_response_cache on PG', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  await runAppMigrations();

  const cacheKey = generateCacheKey('yandex', { model: 'test', input: [{ role: 'user', content: 'hi' }] });
  const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };

  await setCachedResponse(cacheKey, 'yandex', 'cached answer', usage);
  const cached = await getCachedResponse(cacheKey);
  assert.ok(cached);
  assert.equal(cached.response_text, 'cached answer');
  assert.deepEqual(cached.usage, usage);
});

test.after(async () => {
  await closePgPools();
});
