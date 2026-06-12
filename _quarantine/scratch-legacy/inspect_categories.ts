import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

console.log('--- Categories ---');
try {
  const categories = db.prepare('SELECT * FROM categories').all();
  console.table(categories);

  console.log('\n--- Users ---');
  const users = db.prepare('SELECT id, username, category FROM users').all();
  console.table(users);
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error('Error reading DB:', message);
} finally {
  db.close();
}
