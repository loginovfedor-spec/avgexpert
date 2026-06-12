// @ts-expect-error legacy sqlite module removed after PG migration
import db from '../src/core/sqlite';

const rows = db.prepare("SELECT name FROM categories WHERE name LIKE 'Yandex%'").all();
console.log(rows);
db.prepare("DELETE FROM categories WHERE name LIKE 'Yandex%'").run();
console.log('Deleted.');
