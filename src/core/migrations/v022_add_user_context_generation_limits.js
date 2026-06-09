module.exports = {
    version: 22,
    name: 'add_user_context_generation_limits',
    up: (txDb) => {
      txDb.exec(`
        ALTER TABLE categories ADD COLUMN input_context_default INTEGER DEFAULT 1000000;
        ALTER TABLE categories ADD COLUMN input_context_max INTEGER DEFAULT 1000000;
        ALTER TABLE users ADD COLUMN input_context_credits INTEGER;
        ALTER TABLE users ADD COLUMN output_generation_credits INTEGER;

        UPDATE categories
        SET input_context_default = COALESCE(input_context_default, 1000000),
            input_context_max = COALESCE(input_context_max, 1000000);

        UPDATE users
        SET input_context_credits = COALESCE(input_context_credits, n_ctx);
      `);
    }
  };

