module.exports = {
    version: 12,
    name: 'add_debug_mode_to_categories',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE categories ADD COLUMN debug_mode BOOLEAN DEFAULT 0;
      `);
    }
  };

