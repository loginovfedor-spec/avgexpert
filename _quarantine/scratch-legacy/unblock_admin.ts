import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

try {
  console.log('--- Current status before update ---');
  const userBefore = db
    .prepare(
      "SELECT username, category, tokens_allocated, tokens_input_used, tokens_output_used, is_blocked FROM users WHERE username = 'admin'"
    )
    .get();
  console.log(userBefore);

  console.log('\nUpdating admin status...');
  const result = db
    .prepare(`
        UPDATE users
        SET is_blocked = 0,
            tokens_allocated = 1000000,
            tokens_input_used = 0,
            tokens_output_used = 0
        WHERE username = 'admin'
    `)
    .run();

  console.log(`Updated rows: ${result.changes}`);

  console.log('\n--- Status after update ---');
  const userAfter = db
    .prepare(
      "SELECT username, category, tokens_allocated, tokens_input_used, tokens_output_used, is_blocked FROM users WHERE username = 'admin'"
    )
    .get();
  console.log(userAfter);

  console.log('\nDeleting blocks from token usage history...');
  const delResult = db.prepare("DELETE FROM token_usage_history WHERE username = 'admin'").run();
  console.log(`Deleted history records: ${delResult.changes}`);
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error('Error modifying DB:', message);
} finally {
  db.close();
}
