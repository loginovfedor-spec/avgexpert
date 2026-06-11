import assert from 'node:assert/strict';
import { runAppMigrations } from '../src/core/pg/migrate';
import { seedAppData } from '../src/core/pg/seed';
import { getPgPool, closePgPools } from '../src/core/pg/pool';
import userRepository from '../src/modules/auth/user.repository';
import categoryRepository from '../src/modules/admin/category.repository';

async function main(): Promise<void> {
  const applied = await runAppMigrations();
  console.log('app migrations:', applied.length ? applied.join(', ') : 'already up to date');

  await seedAppData();

  const pool = getPgPool();
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'users', 'categories', 'token_usage_history', 'app_migrations',
        'sessions', 'missions', 'payment_orders', 'audit_logs', 'llm_response_cache'
      )
    ORDER BY table_name
  `);
  assert.equal(tables.rowCount, 9, 'expected app tables in PG');

  const admin = await userRepository.findByUsername('admin');
  assert.ok(admin, 'admin user seeded');
  assert.equal(admin.is_admin, true);

  const categories = await categoryRepository.listAll();
  assert.ok(categories['Консультант'], 'consultant category seeded');
  assert.ok(categories['Эксперт'], 'expert category seeded');
  assert.ok(categories['Мудрец'], 'sage category seeded');

  console.log('app:pg:smoke PASS');
}

main()
  .catch((err) => {
    console.error('app:pg:smoke FAIL', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPools();
  });
