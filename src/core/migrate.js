/**
 * AvgExpert — JSON to SQLite Migration Utility
 * 
 * This script migrates legacy JSON data (users, categories, sessions)
 * into the new SQLite database.
 */
const fs = require('fs');
const path = require('path');
const db = require('./sqlite');
const { USERS_FILE, CATEGORIES_FILE, SESSIONS_ROOT } = require('./config');
const logger = require('./logger').scoped('Migration');

function migrate() {
  logger.info('Starting legacy JSON to SQLite migration');

  const migrateCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name, provider, endpoint_url, model_name, api_key, temperature, top_p, top_k, min_p, repeat_penalty, max_tokens, system_prompt, extra_params)
    VALUES (@name, @provider, @endpoint_url, @model_name, @api_key, @temperature, @top_p, @top_k, @min_p, @repeat_penalty, @max_tokens, @system_prompt, @extra_params)
  `);

  const migrateUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, category, expiration_date, n_ctx, system_prompt, email, must_change_password)
    VALUES (@username, @password_hash, @category, @expiration_date, @n_ctx, @system_prompt, @email, @must_change_password)
  `);

  const migrateSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (id, username, title, messages, updatedAt)
    VALUES (@id, @username, @title, @messages, @updatedAt)
  `);

  db.transaction(() => {
    // 1. Categories
    if (fs.existsSync(CATEGORIES_FILE)) {
      logger.info('Migrating categories');
      const cats = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
      for (const [name, cat] of Object.entries(cats)) {
        migrateCategory.run({
          name,
          provider: cat.provider || null,
          endpoint_url: cat.endpoint_url || null,
          model_name: cat.model_name || null,
          api_key: cat.api_key || null,
          temperature: cat.temperature !== undefined ? cat.temperature : null,
          top_p: cat.top_p !== undefined ? cat.top_p : null,
          top_k: cat.top_k !== undefined ? cat.top_k : null,
          min_p: cat.min_p !== undefined ? cat.min_p : null,
          repeat_penalty: cat.repeat_penalty !== undefined ? cat.repeat_penalty : null,
          max_tokens: cat.max_tokens !== undefined ? cat.max_tokens : null,
          system_prompt: cat.system_prompt || null,
          extra_params: cat.extra_params ? JSON.stringify(cat.extra_params) : null,
        });
      }
    }

    // 2. Users
    if (fs.existsSync(USERS_FILE)) {
      logger.info('Migrating users');
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      for (const [username, user] of Object.entries(users)) {
        migrateUser.run({
          username,
          password_hash: user.password_hash,
          category: user.category || null,
          expiration_date: user.expiration_date || null,
          n_ctx: user.n_ctx || null,
          system_prompt: user.system_prompt || null,
          email: user.email || null,
          must_change_password: user.must_change_password ? 1 : 0,
        });
      }
    }

    // 3. Sessions
    if (fs.existsSync(SESSIONS_ROOT)) {
      logger.info('Migrating sessions');
      const userDirs = fs.readdirSync(SESSIONS_ROOT);
      for (const userDir of userDirs) {
        const dirPath = path.join(SESSIONS_ROOT, userDir);
        if (fs.statSync(dirPath).isDirectory()) {
          const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
          for (const f of files) {
            try {
              const data = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
              migrateSession.run({
                id: data.id,
                username: userDir,
                title: data.title || 'Новый чат',
                messages: JSON.stringify(data.messages || []),
                updatedAt: data.updatedAt || Date.now(),
              });
            } catch (e) {
              logger.error('Failed to migrate session', { file: f, username: userDir, error: e.message });
            }
          }
        }
      }
    }
  })();

  logger.info('Legacy migration finished');
}

if (require.main === module) {
  migrate();
  process.exit(0);
}

module.exports = migrate;
