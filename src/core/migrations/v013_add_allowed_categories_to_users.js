module.exports = {
    version: 13,
    name: 'add_allowed_categories_to_users',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE users ADD COLUMN allowed_categories TEXT;
      `);
    }
  };

