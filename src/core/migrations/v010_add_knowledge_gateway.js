module.exports = {
    version: 10,
    name: 'add_knowledge_gateway',
    up: (txDb) => {
      txDb.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_sources (
          id TEXT PRIMARY KEY,
          uri TEXT NOT NULL,
          title TEXT,
          type TEXT,
          checksum TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE NOT NULL,
          source_id TEXT NOT NULL,
          text TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (source_id) REFERENCES knowledge_sources (id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
          text,
          content='knowledge_chunks',
          content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(rowid, text) VALUES (new.id, new.text);
        END;

        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
        END;

        CREATE TRIGGER IF NOT EXISTS knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, text) VALUES('delete', old.id, old.text);
          INSERT INTO knowledge_chunks_fts(rowid, text) VALUES (new.id, new.text);
        END;
      `);
    }
  };

