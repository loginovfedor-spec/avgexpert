const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const v030 = require('../../src/core/migrations/v030_consultant_local_llamacpp');

test('v030 seeds consultant local llamacpp category', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE categories (
      name TEXT PRIMARY KEY,
      provider TEXT,
      model_name TEXT,
      temperature REAL,
      top_p REAL,
      top_k INTEGER,
      min_p REAL,
      repeat_penalty REAL,
      input_context_default INTEGER,
      input_context_max INTEGER,
      max_tokens INTEGER,
      system_prompt TEXT,
      extra_params TEXT,
      routing_mode TEXT,
      fallback_provider TEXT,
      yandex_folder_id TEXT,
      debug_mode INTEGER,
      complexity REAL,
      suggested_questions TEXT,
      sort_index INTEGER,
      rag_allowed INTEGER,
      retrieval_tier TEXT
    );
    INSERT INTO categories (name, provider, model_name, rag_allowed, retrieval_tier, sort_index, max_tokens)
    VALUES ('Консультант', 'yandex', 'aliceai-llm-flash/latest', 1, 'consultant', 10, 1024);
  `);

  v030.up(db);

  const row = db.prepare(`
    SELECT provider, model_name, rag_allowed, retrieval_tier,
           input_context_max, max_tokens, temperature
    FROM categories WHERE name = ?
  `).get('Консультант (Local)');

  assert.strictEqual(row.provider, 'llamacpp');
  assert.strictEqual(row.model_name, 'qwen2.5-7b-instruct');
  assert.strictEqual(row.rag_allowed, 1);
  assert.strictEqual(row.retrieval_tier, 'consultant');
  assert.strictEqual(row.input_context_max, 16384);
  assert.strictEqual(row.max_tokens, 1024);
  assert.strictEqual(row.temperature, 0.4);
  db.close();
});
