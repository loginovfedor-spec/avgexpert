const VALID_TIERS = new Set(['consultant', 'expert', 'sage']);

function normalizeTier(value) {
  return VALID_TIERS.has(value) ? value : 'consultant';
}

module.exports = {
  version: 26,
  name: 'add_category_rag_fields',
  up: (txDb) => {
    txDb.exec(`
      ALTER TABLE categories ADD COLUMN rag_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE categories ADD COLUMN retrieval_tier TEXT NOT NULL DEFAULT 'consultant'
        CHECK (retrieval_tier IN ('consultant', 'expert', 'sage'));
    `);

    const rows = txDb.prepare('SELECT name, extra_params FROM categories').all();
    const update = txDb.prepare(`
      UPDATE categories
      SET rag_enabled = @rag_enabled, retrieval_tier = @retrieval_tier
      WHERE name = @name
    `);

    for (const row of rows) {
      let ragEnabled = 0;
      let retrievalTier = 'consultant';

      if (row.extra_params) {
        try {
          const extra = JSON.parse(row.extra_params);
          if (extra.rag_enabled === true || extra.rag_enabled === 1) {
            ragEnabled = 1;
          }
          if (typeof extra.retrieval_tier === 'string' && extra.retrieval_tier) {
            retrievalTier = normalizeTier(extra.retrieval_tier);
          }
        } catch {
          // keep defaults
        }
      }

      update.run({
        name: row.name,
        rag_enabled: ragEnabled,
        retrieval_tier: retrievalTier,
      });
    }

    const tierByName = {
      'Консультант': 'consultant',
      'Эксперт': 'expert',
      'Мудрец': 'sage',
    };
    for (const [catName, tier] of Object.entries(tierByName)) {
      txDb.prepare(`
        UPDATE categories SET retrieval_tier = @tier
        WHERE name = @name AND retrieval_tier = 'consultant'
      `).run({ name: catName, tier });
    }
  },
};
