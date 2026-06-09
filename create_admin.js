/**
 * Create Admin and Seed Categories Script
 * This script ensures default categories and an admin user exist in the database.
 */
const bcrypt = require('bcrypt');
const db = require('./src/core/sqlite');
const { DEFAULT_CATEGORY_PARAMS, DEFAULT_SYSTEM_PROMPT } = require('./src/core/config');

async function seed() {
  console.log('Starting DB seeding of Users and Categories...');

  // 1. Seed Default Categories if they don't exist
  const defaultCategories = ['Администратор', 'Консультант', 'Эксперт', 'Мудрец'];
  
  db.transaction(() => {
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO categories (name, provider, model_name, temperature, top_p, top_k, min_p, repeat_penalty, max_tokens, system_prompt)
      VALUES (@name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p, @repeat_penalty, @max_tokens, @system_prompt)
    `);

    for (const name of defaultCategories) {
      const existing = db.prepare('SELECT COUNT(*) as count FROM categories WHERE name = ?').get(name);
      if (existing.count === 0) {
        console.log(`Seeding category: ${name}`);
        insertCat.run({
          name,
          ...DEFAULT_CATEGORY_PARAMS,
          system_prompt: DEFAULT_CATEGORY_PARAMS.system_prompt || null
        });
      } else {
        console.log(`Category "${name}" already exists.`);
      }
    }

    // 2. Seed Default Admin User
    // Default to AVGEXPERT_ADMIN_PASSWORD from env, fallback to 'admin'
    const adminPass = process.env.AVGEXPERT_ADMIN_PASSWORD || 'admin';
    const passwordHash = bcrypt.hashSync(adminPass, 10);

    const checkAdmin = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');

    db.prepare(`
      INSERT INTO users (username, password_hash, category, expiration_date, n_ctx, system_prompt, must_change_password, is_admin)
      VALUES (@username, @password_hash, @category, @expiration_date, @n_ctx, @system_prompt, @must_change_password, @is_admin)
      ON CONFLICT(username) DO UPDATE SET
        password_hash = excluded.password_hash,
        category = excluded.category,
        expiration_date = excluded.expiration_date,
        n_ctx = excluded.n_ctx,
        system_prompt = excluded.system_prompt,
        must_change_password = excluded.must_change_password,
        is_admin = excluded.is_admin
    `).run({
      username: 'admin',
      password_hash: passwordHash,
      category: 'Администратор',
      expiration_date: '2099-12-31',
      n_ctx: 4096,
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      must_change_password: 1,
      is_admin: 1,
    });

    if (checkAdmin.count === 0) {
      console.log(`Created admin user "admin" with password "${adminPass}".`);
    } else {
      console.log(`Updated admin user "admin" with password "${adminPass}".`);
    }
  })();

  console.log('DB Seeding completed successfully!');
}

seed().catch(console.error);
