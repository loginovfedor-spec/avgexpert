const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

console.log('--- Categories ---');
try {
    const categories = db.prepare("SELECT * FROM categories").all();
    console.table(categories);
    
    console.log('\n--- Users ---');
    const users = db.prepare("SELECT id, username, category FROM users").all();
    console.table(users);
} catch (e) {
    console.error('Error reading DB:', e.message);
} finally {
    db.close();
}
