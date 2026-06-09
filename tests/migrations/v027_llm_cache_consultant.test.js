const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const v027 = require('../../src/core/migrations/v027_llm_cache_and_consultant_providers');

test('v027 creates llm_response_cache table', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
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
      rag_enabled INTEGER,
      retrieval_tier TEXT
    );
  `);
  v027.up(db);

  const table = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'llm_response_cache'
  `).get();
  assert.ok(table);

  db.prepare(`
    INSERT INTO llm_response_cache (cache_key, provider_id, response_text, usage, created_at)
    VALUES ('key1', 'yandex', 'hello', '{}', 1)
  `).run();

  const row = db.prepare('SELECT provider_id, response_text FROM llm_response_cache WHERE cache_key = ?').get('key1');
  assert.strictEqual(row.provider_id, 'yandex');
  assert.strictEqual(row.response_text, 'hello');
  db.close();
});

test('v027 seeds consultant provider variants', () => {
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
      rag_enabled INTEGER,
      retrieval_tier TEXT
    );
    INSERT INTO categories (name, provider, model_name, rag_enabled, retrieval_tier, sort_index)
    VALUES ('Консультант', 'llamacpp', 'default', 0, 'consultant', 0);
  `);

  v027.up(db);

  const main = db.prepare('SELECT provider, model_name, rag_enabled FROM categories WHERE name = ?').get('Консультант');
  assert.strictEqual(main.provider, 'yandex');
  assert.strictEqual(main.model_name, 'aliceai-llm-flash/latest');
  assert.strictEqual(main.rag_enabled, 1);

  const openai = db.prepare('SELECT provider, model_name, rag_enabled FROM categories WHERE name = ?')
    .get('Консультант (OpenAI)');
  assert.strictEqual(openai.provider, 'openai_gpt4_1');
  assert.strictEqual(openai.model_name, 'gpt-4.1-mini');
  assert.strictEqual(openai.rag_enabled, 1);

  const grok = db.prepare('SELECT provider, model_name FROM categories WHERE name = ?')
    .get('Консультант (Grok)');
  assert.strictEqual(grok.provider, 'grok');
  assert.strictEqual(grok.model_name, 'grok-4-1-fast-non-reasoning');

  db.close();
});
