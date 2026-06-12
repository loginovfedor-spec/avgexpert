import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

console.log('--- Restoring Categories to Original ---');
try {
  db.prepare(`
        UPDATE categories 
        SET provider = 'openai_prompt_file_search', model_name = 'openai_prompt_file_search:prompt' 
        WHERE name = 'Администратор'
    `).run();

  db.prepare(`
        UPDATE categories 
        SET provider = 'openai', model_name = 'gpt-4o-mini' 
        WHERE name IN ('Консультант', 'Эксперт', 'Мудрец')
    `).run();

  const categories = db.prepare('SELECT name, provider, model_name FROM categories').all();
  console.table(categories);
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error('Error restoring DB:', message);
} finally {
  db.close();
}
