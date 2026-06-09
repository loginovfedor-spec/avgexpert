module.exports = {
    version: 23,
    name: 'convert_category_input_limits_to_token_scale',
    up: (txDb) => {
      txDb.exec(`
        UPDATE categories
        SET input_context_default = 1000000
        WHERE input_context_default = 1000;

        UPDATE categories
        SET input_context_max = 1000000
        WHERE input_context_max = 1000;
      `);
    }
  };

