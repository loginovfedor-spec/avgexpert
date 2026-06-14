import path from 'path';
import dotenv from 'dotenv';
import { closePgPools } from '../src/modules/vector/pg/pool';
import { runVectorMigrations } from '../src/modules/vector/pg/migrate';
import { createIngestionPipeline } from '../src/modules/ingestion/pipeline';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const filePath = args.file;
  if (!filePath) {
    console.error('Использование: npm run kb:ingest -- --file <path> [--scope global] [--title "..."]');
    process.exitCode = 1;
    return;
  }

  await runVectorMigrations();

  const pipeline = createIngestionPipeline();
  const result = await pipeline.ingestFile({
    filePath,
    scope: (args.scope as 'global' | 'user' | 'session') || 'global',
    title: args.title,
    bookTitle: args['book-title'] || args.title,
    docType: args['doc-type'],
    bookId: args['book-id'],
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error('[kb:ingest] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPools());
