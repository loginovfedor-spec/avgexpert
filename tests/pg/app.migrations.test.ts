import test from 'node:test';
import assert from 'node:assert/strict';
import { runAppMigrations } from '../../src/core/pg/migrate';
import { seedAppData } from '../../src/core/pg/seed';
import { closePgPools, getPgPool } from '../../src/core/pg/pool';
import { isAppPgEnabled } from '../../src/core/pg/database.port';
import userRepository from '../../src/modules/auth/user.repository';
import categoryRepository from '../../src/modules/admin/category.repository';

test('app PG migrations + seed (requires DATABASE_URL)', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  const applied = await runAppMigrations();
  assert.ok(Array.isArray(applied));

  await seedAppData();

  const pool = getPgPool();
  const users = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  assert.ok((users.rows[0]?.c ?? 0) >= 1);

  const admin = await userRepository.findByUsername('admin');
  assert.ok(admin);

  const cats = await categoryRepository.listAll();
  assert.ok(cats['Консультант']);
  assert.ok(cats['Эксперт (OpenAI)']);

  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('sessions', 'missions', 'payment_orders', 'audit_logs', 'llm_response_cache')
    ORDER BY table_name
  `);
  assert.equal(tables.rowCount, 5, 'D3 app tables present after 002_app_chat');
});

test.after(async () => {
  await closePgPools();
});
