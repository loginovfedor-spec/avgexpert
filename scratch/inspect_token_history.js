const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

try {
    console.log('--- Token Usage History ---');
    const history = db.prepare("SELECT * FROM token_usage_history").all();
    console.table(history);
} catch (e) {
    console.error('Error reading DB:', e.message);
} finally {
    db.close();
}
