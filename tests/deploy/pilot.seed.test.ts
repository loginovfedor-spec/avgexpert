import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}
process.env.AVGEXPERT_ADMIN_PASSWORD = 'PilotAdminPass123!';
process.env.PILOT_TEST_PASSWORD = 'PilotTestPass123!';

import bcrypt from 'bcrypt';
import userRepository from '../../src/modules/auth/user.repository';
import { ensureTestPg, teardownTestPg } from '../helpers/pg_harness';
test('seed_pilot_users creates admin and pilot test accounts', async (t) => {
  t.before(async () => {
    await ensureTestPg();
  });

  t.after(async () => {
    await teardownTestPg();
  });

  const { seedPilotUsers } = await import('../../scripts/seed_pilot_users');
  const { closePgPools } = await import('../../src/core/pg');
  await seedPilotUsers();

  const admin = await userRepository.findByUsername('admin');
  assert.ok(admin);
  assert.equal(admin.is_admin, true);
  assert.equal(admin.category, 'Администратор');

  const consultant = await userRepository.findByUsername('pilot_consultant');
  assert.ok(consultant);
  assert.equal(consultant.category, 'Консультант');
  assert.equal(consultant.is_admin, false);

  const expert = await userRepository.findByUsername('pilot_expert');
  assert.ok(expert);
  assert.equal(expert.category, 'Эксперт');

  const sage = await userRepository.findByUsername('pilot_sage');
  assert.ok(sage);
  assert.equal(sage.category, 'Мудрец');

  assert.ok(consultant?.password_hash);
  assert.ok(
    bcrypt.compareSync(process.env.PILOT_TEST_PASSWORD ?? '', consultant.password_hash)
  );

  await closePgPools();
});
