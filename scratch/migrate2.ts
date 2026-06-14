import { getDatabasePort } from '../src/core/pg/index.js';
getDatabasePort().run("INSERT INTO app_migrations (id) VALUES ('008_payment_orders_credits') ON CONFLICT DO NOTHING;")
  .then(() => console.log('Migrated db records'))
  .catch(console.error)
  .finally(() => process.exit(0));
