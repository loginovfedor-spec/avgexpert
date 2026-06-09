/**
 * Admin Reset Utility (SQLite)
 */
const bcrypt = require('bcrypt');
const db = require('./src/core/sqlite');

async function resetAdmin() {
  const newPass = process.env.AVGEXPERT_ADMIN_PASSWORD || 'admin2026';
  const hash = bcrypt.hashSync(newPass, 10);
  
  const info = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = ?')
    .run(hash, 'admin');

  if (info.changes > 0) {
    console.log(`SUCCESS: Admin password reset to "${newPass}" (must change on next login)`);
  } else {
    console.log('ERROR: User "admin" not found in database');
  }
}

resetAdmin().catch(console.error);
