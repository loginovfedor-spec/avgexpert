/**
 * D6-3: Fresh admin + pilot test users on production PG.
 * Run on server: docker compose exec app npm run prod:seed-pilot-users
 * Or locally: DATABASE_URL=... npm run prod:seed-pilot-users
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { runAppMigrations } from '../src/core/pg/migrate';
import { seedAppData } from '../src/core/pg/seed';
import { closePgPools, getDatabasePort } from '../src/core/pg';
import userRepository from '../src/modules/auth/user.repository';

const PILOT_USERS = [
  {
    username: 'pilot_consultant',
    category: 'Консультант',
    is_admin: false,
    n_ctx: 4096,
  },
  {
    username: 'pilot_expert',
    category: 'Эксперт',
    is_admin: false,
    n_ctx: 8192,
  },
  {
    username: 'pilot_sage',
    category: 'Мудрец',
    is_admin: false,
    n_ctx: 8192,
  },
] as const;

function requireAdminPassword(): string {
  const pass = process.env.AVGEXPERT_ADMIN_PASSWORD;
  if (!pass || pass.length < 8) {
    throw new Error('AVGEXPERT_ADMIN_PASSWORD must be set (min 8 chars) before seeding pilot users');
  }
  return pass;
}

function pilotTestPassword(): string {
  return process.env.PILOT_TEST_PASSWORD || 'PilotTest2026!';
}

async function upsertUser(
  username: string,
  fields: {
    password_hash: string;
    category: string;
    is_admin: boolean;
    n_ctx: number;
    must_change_password?: boolean;
    is_blocked?: boolean;
  }
): Promise<void> {
  const existing = await userRepository.findByUsername(username);
  await userRepository.save(username, {
    ...existing,
    password_hash: fields.password_hash,
    category: fields.category,
    expiration_date: '2099-12-31',
    n_ctx: fields.n_ctx,
    must_change_password: fields.must_change_password ?? false,
    is_admin: fields.is_admin,
    is_blocked: fields.is_blocked ?? false,
  });
}

export async function seedPilotUsers(): Promise<void> {
  const adminPass = requireAdminPassword();
  const testPass = pilotTestPassword();
  const testHash = bcrypt.hashSync(testPass, 10);
  const adminHash = bcrypt.hashSync(adminPass, 10);

  await runAppMigrations();
  await seedAppData();

  await upsertUser('admin', {
    password_hash: adminHash,
    category: 'Администратор',
    is_admin: true,
    n_ctx: 4096,
    must_change_password: false,
    is_blocked: false,
  });

  for (const user of PILOT_USERS) {
    await upsertUser(user.username, {
      password_hash: testHash,
      category: user.category,
      is_admin: user.is_admin,
      n_ctx: user.n_ctx,
      must_change_password: false,
    });
  }

  const db = getDatabasePort();
  const countRow = await db.get(
    'SELECT COUNT(*)::int AS count FROM users WHERE username LIKE @pattern',
    { pattern: 'pilot_%' }
  );
  assert.equal(countRow?.count, PILOT_USERS.length, 'expected pilot test users');
}

async function main(): Promise<void> {
  await seedPilotUsers();
  console.log('prod:seed-pilot-users PASS');
  console.log('  admin — password from AVGEXPERT_ADMIN_PASSWORD');
  console.log(`  pilot_consultant, pilot_expert, pilot_sage — password: ${pilotTestPassword()}`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('prod:seed-pilot-users FAIL', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePgPools();
    });
}
