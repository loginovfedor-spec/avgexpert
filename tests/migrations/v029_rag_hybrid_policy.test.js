const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const migration = require('../../src/core/migrations/v029_rag_hybrid_policy');

test('v029 renames categories.rag_enabled to rag_allowed and adds users.rag_enabled', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE categories (
      name TEXT PRIMARY KEY,
      rag_enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE users (
      username TEXT PRIMARY KEY
    );
    INSERT INTO categories (name, rag_enabled) VALUES ('Консультант', 1), ('Быстрый', 0);
    INSERT INTO users (username) VALUES ('alice'), ('bob');
  `);

  migration.up(db);

  const consultant = db.prepare('SELECT rag_allowed FROM categories WHERE name = ?').get('Консультант');
  assert.strictEqual(consultant.rag_allowed, 1);

  const fast = db.prepare('SELECT rag_allowed FROM categories WHERE name = ?').get('Быстрый');
  assert.strictEqual(fast.rag_allowed, 0);

  const users = db.prepare('SELECT username, rag_enabled FROM users ORDER BY username').all();
  assert.deepEqual(users, [
    { username: 'alice', rag_enabled: 1 },
    { username: 'bob', rag_enabled: 1 },
  ]);

  db.close();
});
