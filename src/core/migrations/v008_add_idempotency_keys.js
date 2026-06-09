module.exports = {
    version: 8,
    name: 'add_idempotency_keys',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          key TEXT PRIMARY KEY,
          response_code INTEGER,
          response_body TEXT,
          created_at INTEGER NOT NULL
        );
      `);
    }
  };

