const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('./config');
const logger = require('./logger').scoped('SQLite');

/**
 * Database Initialization
 */

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'database.sqlite');
/** @type {import('better-sqlite3').Database} */
const db = new Database(dbPath);

// Performance & Safety Pragma
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize Migration System
db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  );
`);

const migrations = require('./migrations');

function runMigrations() {
  db.exec('BEGIN EXCLUSIVE TRANSACTION');
  try {
    const currentVersionRow = db.prepare('SELECT MAX(version) as v FROM migrations').get();
    const currentVersion = currentVersionRow?.v || 0;

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info('Applying migration', { version: migration.version, name: migration.name });
        migration.up(db);
        db.prepare('INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          migration.version,
          migration.name,
          Date.now()
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    logger.error('Migration failed', error);
    throw error;
  }
}

runMigrations();

/**
 * Seeding (Clean Install Only)
 */
function seed() {
  const checkAdmin = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');
  if (checkAdmin.count > 0) return;

  logger.info('Admin user missing. Seeding initial data');
  
  const { DEFAULT_CATEGORY_PARAMS, DEFAULT_SYSTEM_PROMPT } = require('./config');
  const crypto = require('crypto');
  const bcrypt = require('bcrypt');

  db.transaction(() => {
    // 1. Seed Default Categories
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO categories (name, provider, model_name, temperature, top_p, top_k, min_p, repeat_penalty, input_context_default, input_context_max, max_tokens, system_prompt)
      VALUES (@name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p, @repeat_penalty, @input_context_default, @input_context_max, @max_tokens, @system_prompt)
    `);

    const defaultCategories = ['Администратор', 'Консультант', 'Эксперт', 'Мудрец'];
    for (const name of defaultCategories) {
      insertCat.run({
        name,
        ...DEFAULT_CATEGORY_PARAMS,
        system_prompt: DEFAULT_CATEGORY_PARAMS.system_prompt || null
      });
    }

    // 2. Seed Default Admin
    const adminPass = process.env.AVGEXPERT_ADMIN_PASSWORD;
    const finalAdminPass = adminPass || crypto.randomBytes(16).toString('hex');
    
    if (!adminPass) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (!isProduction) {
        logger.warn('Generated development admin password', { username: 'admin', password: finalAdminPass });
      } else {
        // This should normally be unreachable due to config.js checks
        logger.warn('AVGEXPERT_ADMIN_PASSWORD missing in production seed. Password auto-generated but not logged');
      }
    }

    db.prepare(`
      INSERT OR IGNORE INTO users (username, password_hash, category, expiration_date, n_ctx, system_prompt, must_change_password, is_admin)
      VALUES (@username, @password_hash, @category, @expiration_date, @n_ctx, @system_prompt, @must_change_password, @is_admin)
    `).run({
      username: 'admin',
      password_hash: bcrypt.hashSync(finalAdminPass, 10),
      category: 'Администратор',
      expiration_date: '2099-12-31',
      n_ctx: 4096,
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      must_change_password: 1,
      is_admin: 1,
    });
  })();
  
  logger.info('Seed completed');
}

// Auto-seed on first run
seed();

export = db;

