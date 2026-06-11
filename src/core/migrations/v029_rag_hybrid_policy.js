module.exports = {
  version: 29,
  name: 'rag_hybrid_policy',
  up: (txDb) => {
    txDb.exec(`
      ALTER TABLE categories RENAME COLUMN rag_enabled TO rag_allowed;
      ALTER TABLE users ADD COLUMN rag_enabled INTEGER NOT NULL DEFAULT 1;
    `);
  },
};
