module.exports = {
    version: 3,
    name: 'add_policy_router_fields',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE categories ADD COLUMN routing_mode TEXT DEFAULT 'direct';
        ALTER TABLE categories ADD COLUMN fallback_provider TEXT;
      `);
    }
  };

