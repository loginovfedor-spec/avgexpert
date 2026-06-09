const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const v026 = require('../../src/core/migrations/v026_add_category_rag_fields');

test('v026 adds rag_enabled and retrieval_tier; migrates from extra_params', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE categories (
      name TEXT PRIMARY KEY,
      extra_params TEXT
    );
    INSERT INTO categories (name, extra_params) VALUES
      ('plain', NULL),
      ('with-rag', '{"rag_enabled":true,"retrieval_tier":"expert"}');
  `);

  v026.up(db);

  const plain = db.prepare('SELECT rag_enabled, retrieval_tier FROM categories WHERE name = ?').get('plain');
  assert.strictEqual(plain.rag_enabled, 0);
  assert.strictEqual(plain.retrieval_tier, 'consultant');

  const withRag = db.prepare('SELECT rag_enabled, retrieval_tier FROM categories WHERE name = ?').get('with-rag');
  assert.strictEqual(withRag.rag_enabled, 1);
  assert.strictEqual(withRag.retrieval_tier, 'expert');

  db.close();
});

test('v026 normalizes invalid retrieval_tier from extra_params', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE categories (name TEXT PRIMARY KEY, extra_params TEXT);
    INSERT INTO categories (name, extra_params) VALUES ('bad', '{"retrieval_tier":"invalid"}');
  `);
  v026.up(db);
  const row = db.prepare('SELECT retrieval_tier FROM categories WHERE name = ?').get('bad');
  assert.strictEqual(row.retrieval_tier, 'consultant');
  db.close();
});
