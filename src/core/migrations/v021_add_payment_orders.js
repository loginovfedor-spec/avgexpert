module.exports = {
    version: 21,
    name: 'add_payment_orders',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          package_id TEXT NOT NULL,
          credits INTEGER NOT NULL,
          tokens INTEGER NOT NULL,
          amount_rub INTEGER NOT NULL,
          inv_id INTEGER UNIQUE,
          status TEXT NOT NULL DEFAULT 'pending',
          robokassa_out_sum TEXT,
          robokassa_fee TEXT,
          payment_method TEXT,
          signature TEXT,
          created_at INTEGER NOT NULL,
          paid_at INTEGER,
          FOREIGN KEY (username) REFERENCES users (username) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_payment_orders_username ON payment_orders(username);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
      `);
    }
  };

