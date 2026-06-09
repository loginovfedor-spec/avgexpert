module.exports = {
    version: 14,
    name: 'add_category_to_sessions',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE sessions ADD COLUMN category TEXT;
      `);
    }
  };

