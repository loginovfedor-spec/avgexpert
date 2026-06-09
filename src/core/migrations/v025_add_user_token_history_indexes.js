module.exports = {
    version: 25,
    name: 'add_user_token_history_indexes',
    up: (txDb) => {
      txDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_expiration_date ON users(expiration_date);
        CREATE INDEX IF NOT EXISTS idx_token_usage_history_username_recorded_at ON token_usage_history(username, recorded_at DESC);
      `);
    }
  };

