const fs = require('fs');
const path = require('path');

// Set NODE_ENV to test to use data_test directory
process.env.NODE_ENV = 'test';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

const db = require('../src/core/sqlite');
const fixturesPath = path.join(__dirname, 'fixtures');

function loadFixtures() {
  console.log('--- Initializing Test Harness with Fixtures ---');
  
  // 1. Load Users
  const usersPath = path.join(fixturesPath, 'users.json');
  if (fs.existsSync(usersPath)) {
    console.log('Loading Users Fixture...');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, category, n_ctx)
      VALUES (@username, @password_hash, @category, @n_ctx)
      ON CONFLICT(username) DO UPDATE SET 
        password_hash=excluded.password_hash,
        category=excluded.category,
        n_ctx=excluded.n_ctx
    `);
    
    db.transaction(() => {
      for (const user of users) {
        insertUser.run(user);
        console.log(`  - Upserted user: ${user.username}`);
      }
    })();
  }

  // 2. Load Categories
  const categoriesPath = path.join(fixturesPath, 'categories.json');
  if (fs.existsSync(categoriesPath)) {
    console.log('Loading Categories Fixture...');
    const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
    const insertCategory = db.prepare(`
      INSERT INTO categories (name, provider, model_name, temperature, top_p, top_k, min_p, repeat_penalty, max_tokens, system_prompt, yandex_folder_id)
      VALUES (@name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p, @repeat_penalty, @max_tokens, @system_prompt, @yandex_folder_id)
      ON CONFLICT(name) DO UPDATE SET
        provider=excluded.provider,
        model_name=excluded.model_name,
        temperature=excluded.temperature,
        max_tokens=excluded.max_tokens,
        system_prompt=excluded.system_prompt
    `);

    db.transaction(() => {
      for (const cat of categories) {
        insertCategory.run(cat);
        console.log(`  - Upserted category: ${cat.name}`);
      }
    })();
  }

  // 3. Load Sessions
  const sessionsPath = path.join(fixturesPath, 'sessions.json');
  if (fs.existsSync(sessionsPath)) {
    console.log('Loading Sessions Fixture...');
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    const insertSession = db.prepare(`
      INSERT INTO sessions (id, username, title, messages, updatedAt)
      VALUES (@id, @username, @title, @messages, @updatedAt)
      ON CONFLICT(id, username) DO UPDATE SET
        title=excluded.title,
        messages=excluded.messages,
        updatedAt=excluded.updatedAt
    `);


    db.transaction(() => {
      for (const sess of sessions) {
        insertSession.run({
          ...sess,
          messages: JSON.stringify(sess.messages),
          updatedAt: sess.updatedAt || sess.updated_at || Date.now()
        });

        console.log(`  - Upserted session: ${sess.id} (${sess.title})`);
      }
    })();
  }

  console.log('--- Test Data Fixtures Loaded ---');
}

if (require.main === module) {
  try {
    loadFixtures();
    process.exit(0);
  } catch (err) {
    console.error('Failed to load test fixtures:', err);
    process.exit(1);
  }
}

module.exports = { loadFixtures };
