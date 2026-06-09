module.exports = {
    version: 17,
    name: 'add_category_complexity',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE categories ADD COLUMN complexity REAL DEFAULT 1.0;
      `);
    }
  };

