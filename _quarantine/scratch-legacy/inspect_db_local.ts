import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

console.log('--- Tables ---');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
  console.log(tables.map((t) => t.name).join(', '));

  for (const table of tables) {
    if (table.name === 'sessions') {
      console.log('\n--- Recent Sessions ---');
      const recentSessions = db
        .prepare('SELECT id, userId, title, createdAt FROM sessions ORDER BY createdAt DESC LIMIT 5')
        .all();
      console.table(recentSessions);
    }
    if (table.name === 'agent_runs') {
      console.log('\n--- Active Agent Runs ---');
      const activeRuns = db
        .prepare(
          "SELECT id, state, createdAt FROM agent_runs WHERE state NOT IN ('completed', 'failed', 'cancelled') ORDER BY createdAt DESC LIMIT 5"
        )
        .all();
      console.table(activeRuns);
    }
  }
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error('Error reading DB:', message);
} finally {
  db.close();
}
