import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

try {
  console.log('--- Token Usage History ---');
  const history = db.prepare('SELECT * FROM token_usage_history').all();
  console.table(history);
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error('Error reading DB:', message);
} finally {
  db.close();
}
