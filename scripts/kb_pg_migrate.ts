import path = require('path');
import dotenv = require('dotenv');
import { runVectorMigrations } from '../src/modules/vector/pg/migrate';
import { closePgPools } from '../src/modules/vector/pg/pool';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const applied = await runVectorMigrations();
  if (applied.length === 0) {
    console.log('Vector migrations: уже применены');
  } else {
    console.log(`Vector migrations applied: ${applied.join(', ')}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[kb:pg:migrate] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPools());
