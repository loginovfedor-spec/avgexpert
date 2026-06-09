/**
 * S9-3 live load probe: concurrent consultant retrieval against real embedder + PG.
 * Usage: tsx scripts/rag_retrieval_load.ts [--concurrency=16] [--rounds=5]
 */
import dotenv = require('dotenv');
import path = require('path');
import { closePgPools } from '../src/modules/vector/pg/pool';
import { createTieredRetrieverFromEnv } from '../src/modules/vector/registry';
import { loadEmbeddingConfig } from '../src/modules/vector/embedding.service';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NFR1_P95_MS = 300;

function parseArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  const value = Number(hit.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function main(): Promise<void> {
  const concurrency = parseArg('concurrency', 16);
  const rounds = parseArg('rounds', 5);
  const embedding = loadEmbeddingConfig();
  const retriever = createTieredRetrieverFromEnv();

  const samples: number[] = [];
  const query = 'аварийная остановка реактора процедура';

  for (let round = 0; round < rounds; round++) {
    const started = Date.now();
    await Promise.all(
      Array.from({ length: concurrency }, () =>
        retriever.retrieveWithTiming(query, {
          userId: 'load-probe',
          tier: 'consultant',
          scopes: ['global'],
          globalKbEnabled: true,
        })
      )
    );
    samples.push(Date.now() - started);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    namespace: embedding.namespace,
    embedder: embedding.model,
    concurrency,
    rounds,
    nfr1P95BudgetMs: NFR1_P95_MS,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    p99Ms: percentile(samples, 99),
    maxMs: Math.max(...samples),
    passNfr1: percentile(samples, 95) <= NFR1_P95_MS,
    samples,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passNfr1) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('[rag_retrieval_load] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPools());
