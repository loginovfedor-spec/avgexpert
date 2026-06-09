const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const migration = require('../../src/core/migrations/v028_tier_provider_categories');

function createSchema(db) {
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
  `);
}

test('v028 seeds expert and sage provider variants', () => {
  const db = new Database(':memory:');
  createSchema(db);
  db.prepare(`
    INSERT INTO categories (name, provider, model_name, rag_enabled, retrieval_tier, sort_index, complexity, max_tokens)
    VALUES ('Эксперт', 'llamacpp', 'default', 0, 'consultant', 0, 1.0, 1024),
           ('Мудрец', 'llamacpp', 'default', 0, 'consultant', 0, 1.0, 1024)
  `).run();

  migration.up(db);

  const expert = db.prepare('SELECT * FROM categories WHERE name = ?').get('Эксперт');
  assert.strictEqual(expert.retrieval_tier, 'expert');
  assert.strictEqual(expert.rag_enabled, 1);
  assert.strictEqual(expert.provider, 'openai_gpt4_1');
  assert.strictEqual(expert.model_name, 'gpt-4.1');

  const sage = db.prepare('SELECT * FROM categories WHERE name = ?').get('Мудрец');
  assert.strictEqual(sage.retrieval_tier, 'sage');
  assert.strictEqual(sage.rag_enabled, 1);
  assert.strictEqual(sage.provider, 'openai_gpt5_5');
  assert.strictEqual(sage.model_name, 'gpt-5.5');

  const variants = db.prepare(`
    SELECT name, retrieval_tier, provider
    FROM categories
    WHERE name LIKE 'Эксперт (%' OR name LIKE 'Мудрец (%'
    ORDER BY name
  `).all();

  assert.equal(variants.length, 4);
  assert.ok(variants.some((row) => row.name === 'Эксперт (Grok)' && row.retrieval_tier === 'expert'));
  assert.ok(variants.some((row) => row.name === 'Мудрец (OpenAI)' && row.retrieval_tier === 'sage'));
});
