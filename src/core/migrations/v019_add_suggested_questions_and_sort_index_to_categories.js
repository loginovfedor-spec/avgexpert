module.exports = {
    version: 19,
    name: 'add_suggested_questions_and_sort_index_to_categories',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE categories ADD COLUMN suggested_questions TEXT DEFAULT '';
        ALTER TABLE categories ADD COLUMN sort_index INTEGER DEFAULT 0;
      `);
    }
  };

