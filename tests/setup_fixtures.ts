import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './helpers/test-env';
import { getDatabasePort, isAppPgEnabled } from '../src/core/pg';
import { ensureTestPg } from './helpers/pg_harness';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const fixturesPath = path.join(__dirname, 'fixtures');

export async function loadFixtures(): Promise<void> {
  console.log('--- Initializing Test Harness with Fixtures (PG) ---');
  await ensureTestPg();
  const db = getDatabasePort();

  const usersPath = path.join(fixturesPath, 'users.json');
  if (fs.existsSync(usersPath)) {
    console.log('Loading Users Fixture...');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8')) as Array<Record<string, unknown>>;
    for (const user of users) {
      await db.run(
        `
          INSERT INTO users (username, password_hash, category, n_ctx)
          VALUES (@username, @password_hash, @category, @n_ctx)
          ON CONFLICT (username) DO UPDATE SET
            password_hash = excluded.password_hash,
            category = excluded.category,
            n_ctx = excluded.n_ctx
        `,
        user
      );
      console.log(`  - Upserted user: ${user.username}`);
    }
  }

  const categoriesPath = path.join(fixturesPath, 'categories.json');
  if (fs.existsSync(categoriesPath)) {
    console.log('Loading Categories Fixture...');
    const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8')) as Array<Record<string, unknown>>;
    for (const cat of categories) {
      await db.run(
        `
          INSERT INTO categories (
            name, provider, model_name, temperature, top_p, top_k, min_p,
            repeat_penalty, max_tokens, system_prompt, yandex_folder_id
          ) VALUES (
            @name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p,
            @repeat_penalty, @max_tokens, @system_prompt, @yandex_folder_id
          )
          ON CONFLICT (name) DO UPDATE SET
            provider = excluded.provider,
            model_name = excluded.model_name,
            temperature = excluded.temperature,
            max_tokens = excluded.max_tokens,
            system_prompt = excluded.system_prompt
        `,
        cat
      );
      console.log(`  - Upserted category: ${cat.name}`);
    }
  }

  const sessionsPath = path.join(fixturesPath, 'sessions.json');
  if (fs.existsSync(sessionsPath)) {
    console.log('Loading Sessions Fixture...');
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8')) as Array<Record<string, unknown>>;
    for (const sess of sessions) {
      await db.run(
        `
          INSERT INTO sessions (id, username, title, messages, category, updated_at)
          VALUES (@id, @username, @title, @messages, @category, @updated_at)
          ON CONFLICT (id, username) DO UPDATE SET
            title = excluded.title,
            messages = excluded.messages,
            updated_at = excluded.updated_at
        `,
        {
          ...sess,
          messages: JSON.stringify(sess.messages),
          updated_at: (sess.updatedAt as number) || (sess.updated_at as number) || Date.now(),
          category: sess.category || null,
        }
      );
      console.log(`  - Upserted session: ${sess.id} (${sess.title})`);
    }
  }

  if (!isAppPgEnabled()) {
    throw new Error('DATABASE_URL is required for fixtures (SQLite removed in D4)');
  }

  console.log('--- Test Data Fixtures Loaded ---');
}

if (process.argv[1] === __filename) {
  loadFixtures()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to load test fixtures:', err);
      process.exit(1);
    });
}
