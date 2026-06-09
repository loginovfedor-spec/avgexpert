import path = require('path');
import { spawnSync } from 'node:child_process';
import dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COMPOSE_DIR = path.join(__dirname, '..', 'local-dev');
const TEI_HEALTH_URL = process.env.LOCAL_TEI_HEALTH_URL || 'http://127.0.0.1:8090/health';
const WAIT_TIMEOUT_MS = parseInt(process.env.LOCAL_TEI_WAIT_MS || '600000', 10);
const POLL_MS = 5000;

type Command = 'up' | 'down' | 'status' | 'wait' | 'smoke';

function parseCommand(argv: string[]): Command {
  const cmd = argv[2] as Command;
  if (!cmd || !['up', 'down', 'status', 'wait', 'smoke'].includes(cmd)) {
    console.error('Использование: tsx scripts/local_stack.ts <up|down|status|wait|smoke>');
    process.exitCode = 1;
    throw new Error('invalid command');
  }
  return cmd;
}

function runCompose(args: string[]): number {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: COMPOSE_DIR,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

async function fetchHealth(): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const response = await fetch(TEI_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    return { ok: false, body: err instanceof Error ? err.message : String(err) };
  }
}

async function waitForTei(): Promise<void> {
  const started = Date.now();
  console.log(`[local:wait] ожидание TEI: ${TEI_HEALTH_URL} (timeout ${WAIT_TIMEOUT_MS}ms)`);

  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    const health = await fetchHealth();
    if (health.ok) {
      console.log('[local:wait] TEI ready', health.body || '');
      return;
    }
    console.log('[local:wait] not ready yet...', health.body || health.status);
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }

  throw new Error('[local:wait] TEI не поднялся в отведённое время');
}

async function smokeEmbedding(): Promise<void> {
  process.env.VECTOR_EMBEDDING_CONFIG = process.env.VECTOR_EMBEDDING_CONFIG || 'bge_m3.local';
  process.env.EMBEDDING_MOCK = 'false';

  const { loadEmbeddingConfig, createEmbeddingProviderFromEnv } = await import(
    '../src/modules/vector/embedding.service'
  );
  const config = loadEmbeddingConfig();
  console.log('[local:smoke] embedding config', {
    apiUrl: config.apiUrl,
    model: config.model,
    dimensions: config.dimensions,
    namespace: config.namespace,
  });

  const provider = createEmbeddingProviderFromEnv();
  const started = Date.now();
  const vector = await provider.embedQuery('локальный smoke test vector kb');
  console.log('[local:smoke] ok', {
    dims: vector.length,
    elapsedMs: Date.now() - started,
    sample: vector.slice(0, 3).map(v => Number(v.toFixed(6))),
  });
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv);

  if (command === 'up') {
    const code = runCompose(['up', '-d']);
    if (code !== 0) process.exit(code);
    await waitForTei();
    return;
  }

  if (command === 'down') {
    process.exit(runCompose(['down']));
  }

  if (command === 'status') {
    const code = runCompose(['ps']);
    const health = await fetchHealth();
    console.log('[local:status] TEI health', health);
    process.exit(code);
  }

  if (command === 'wait') {
    await waitForTei();
    return;
  }

  if (command === 'smoke') {
    await waitForTei();
    await smokeEmbedding();
  }
}

main().catch((err: unknown) => {
  console.error('[local_stack] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
