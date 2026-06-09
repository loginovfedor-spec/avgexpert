module.exports = {
    version: 1,
    name: 'initial_schema',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          username TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          category TEXT,
          expiration_date TEXT,
          n_ctx INTEGER,
          system_prompt TEXT,
          email TEXT,
          must_change_password BOOLEAN,
          token_version INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categories (
          name TEXT PRIMARY KEY,
          provider TEXT,
          endpoint_url TEXT,
          model_name TEXT,
          api_key TEXT,
          temperature REAL,
          top_p REAL,
          top_k INTEGER,
          min_p REAL,
          repeat_penalty REAL,
          max_tokens INTEGER,
          system_prompt TEXT,
          extra_params TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT NOT NULL,
          username TEXT NOT NULL,
          title TEXT,
          messages TEXT,
          updatedAt INTEGER,
          PRIMARY KEY (id, username),
          FOREIGN KEY (username) REFERENCES users (username) ON DELETE CASCADE
        );
      `);
    }
  };

