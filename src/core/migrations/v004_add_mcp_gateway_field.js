module.exports = {
    version: 4,
    name: 'add_mcp_gateway_field',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE categories ADD COLUMN mcp_gateway TEXT;
      `);
    }
  };

