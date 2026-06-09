module.exports = {
    version: 18,
    name: 'add_tokens_allocated_to_history',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE token_usage_history ADD COLUMN tokens_allocated INTEGER NOT NULL DEFAULT 0;
      `);
    }
  };

