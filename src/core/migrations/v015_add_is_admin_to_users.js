module.exports = {
    version: 15,
    name: 'add_is_admin_to_users',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0;
        UPDATE users SET is_admin = 1 WHERE username = 'admin';
      `);
    }
  };

