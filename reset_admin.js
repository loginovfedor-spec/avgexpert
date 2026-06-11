/**
 * Admin Reset Utility (PostgreSQL)
 */
const bcrypt = require('bcrypt');
const { runAppMigrations, closePgPools, getDatabasePort } = require('./src/core/pg');

async function resetAdmin() {
  await runAppMigrations();
  const newPass = process.env.AVGEXPERT_ADMIN_PASSWORD || 'admin2026';
  const hash = bcrypt.hashSync(newPass, 10);
  const db = getDatabasePort();
  const result = await db.run(
    'UPDATE users SET password_hash = @hash, must_change_password = 1 WHERE username = @username',
    { hash, username: 'admin' }
  );

  if (result.changes > 0) {
    console.log(`SUCCESS: Admin password reset to "${newPass}" (must change on next login)`);
  } else {
    console.log('ERROR: User "admin" not found in database');
  }
  await closePgPools();
}

resetAdmin().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
