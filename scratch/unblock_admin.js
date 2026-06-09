const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new Database(dbPath);

try {
    console.log('--- Current status before update ---');
    const userBefore = db.prepare("SELECT username, category, tokens_allocated, tokens_input_used, tokens_output_used, is_blocked FROM users WHERE username = 'admin'").get();
    console.log(userBefore);

    console.log('\nUpdating admin status...');
    const result = db.prepare(`
        UPDATE users
        SET is_blocked = 0,
            tokens_allocated = 1000000,
            tokens_input_used = 0,
            tokens_output_used = 0
        WHERE username = 'admin'
    `).run();

    console.log(`Updated rows: ${result.changes}`);

    console.log('\n--- Status after update ---');
    const userAfter = db.prepare("SELECT username, category, tokens_allocated, tokens_input_used, tokens_output_used, is_blocked FROM users WHERE username = 'admin'").get();
    console.log(userAfter);

    console.log('\nDeleting blocks from token usage history...');
    const delResult = db.prepare("DELETE FROM token_usage_history WHERE username = 'admin'").run();
    console.log(`Deleted history records: ${delResult.changes}`);

} catch (e) {
    console.error('Error modifying DB:', e.message);
} finally {
    db.close();
}
