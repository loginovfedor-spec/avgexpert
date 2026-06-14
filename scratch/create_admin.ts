/**
 * Create Admin and Seed Categories (PostgreSQL)
 * Run: tsx scratch/create_admin.ts
 */
import bcrypt from 'bcrypt';
import { runAppMigrations } from '../src/core/pg/migrate';
import { seedAppData } from '../src/core/pg/seed';
import { closePgPools, getDatabasePort } from '../src/core/pg';

async function seed(): Promise<void> {
  console.log('Starting PG seed of users and categories...');
  await runAppMigrations();
  await seedAppData();

  const adminPass = process.env.AVGEXPERT_ADMIN_PASSWORD || 'admin';
  const passwordHash = bcrypt.hashSync(adminPass, 10);
  const db = getDatabasePort();
  await db.run(
    `
      INSERT INTO users (
        username, password_hash, category, expiration_date, n_ctx,
        must_change_password, is_admin
      ) VALUES (
        @username, @password_hash, @category, @expiration_date, @n_ctx,
        @must_change_password, @is_admin
      )
      ON CONFLICT (username) DO UPDATE SET
        password_hash = excluded.password_hash,
        category = excluded.category,
        must_change_password = excluded.must_change_password,
        is_admin = excluded.is_admin
    `,
    {
      username: 'admin',
      password_hash: passwordHash,
      category: 'Администратор',
      expiration_date: '2099-12-31',
      n_ctx: 4096,
      must_change_password: 1,
      is_admin: 1,
    }
  );

  console.log(`Admin user "admin" ready (password from AVGEXPERT_ADMIN_PASSWORD or "admin").`);
  await closePgPools();
  console.log('PG seeding completed successfully!');
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
