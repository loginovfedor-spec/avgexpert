module.exports = {
    version: 20,
    name: 'rename_mcp_gateway_to_yandex_folder_id',
    up: (txDb) => {
      txDb.exec(`ALTER TABLE categories RENAME COLUMN mcp_gateway TO yandex_folder_id;`);
    }
  };

