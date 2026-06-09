module.exports = {
    version: 16,
    name: 'add_token_accounting',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE users ADD COLUMN tokens_allocated INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN tokens_input_used INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN tokens_output_used INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT 0;

        CREATE TABLE IF NOT EXISTS token_usage_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          tokens_input INTEGER NOT NULL DEFAULT 0,
          tokens_output INTEGER NOT NULL DEFAULT 0,
          recorded_at INTEGER NOT NULL,
          reason TEXT,
          FOREIGN KEY (username) REFERENCES users (username) ON DELETE CASCADE
        );
      `);
    }
  };

