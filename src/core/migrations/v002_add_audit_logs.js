module.exports = {
    version: 2,
    name: 'add_audit_logs',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT,
          action TEXT NOT NULL,
          details TEXT,
          ip_address TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (username) REFERENCES users (username) ON DELETE SET NULL
        );
      `);
    }
  };

