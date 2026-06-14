import path from 'path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COMPOSE_DIR = path.join(__dirname, '..', 'local-dev');
const TEI_HEALTH_URL = process.env.LOCAL_TEI_HEALTH_URL || 'http://127.0.0.1:8090/health';
const LLAMA_HEALTH_URL = process.env.LOCAL_LLAMA_HEALTH_URL || 'http://127.0.0.1:8201/health';
const WAIT_TIMEOUT_MS = parseInt(process.env.LOCAL_TEI_WAIT_MS || '600000', 10);
const LLAMA_WAIT_TIMEOUT_MS = parseInt(process.env.LOCAL_LLAMA_WAIT_MS || '3600000', 10);
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

async function fetchHealth(url: string): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    return { ok: false, body: err instanceof Error ? err.message : String(err) };
  }
}

function formatWaitStatus(label: string, health: { status?: number; body?: string }): string {
  if (health.status === 503 && health.body?.includes('Loading model')) {
    return `[local:wait] ${label}: загрузка модели в память (503) — обычно 1–3 мин после скачивания GGUF`;
  }
  return `[local:wait] ${label} not ready yet... ${health.body || health.status}`;
}

async function waitForService(label: string, url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  console.log(`[local:wait] ожидание ${label}: ${url} (timeout ${timeoutMs}ms)`);

  while (Date.now() - started < timeoutMs) {
    const health = await fetchHealth(url);
    if (health.ok) {
      console.log(`[local:wait] ${label} ready`, health.body || '');
      return;
    }
    console.log(formatWaitStatus(label, health));
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }

  throw new Error(`[local:wait] ${label} не поднялся в отведённое время`);
}

async function waitForTei(): Promise<void> {
  return waitForService('TEI', TEI_HEALTH_URL, WAIT_TIMEOUT_MS);
}

async function waitForLlama(): Promise<void> {
  return waitForService('Llama.cpp', LLAMA_HEALTH_URL, LLAMA_WAIT_TIMEOUT_MS);
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
  console.log('[local:smoke] embedding ok', {
    dims: vector.length,
    elapsedMs: Date.now() - started,
    sample: vector.slice(0, 3).map(v => Number(v.toFixed(6))),
  });
}

function normalizeLlamaBaseUrl(endpointUrl: string): string {
  const raw = endpointUrl.trim().replace(/\/+$/, '');
  if (raw.endsWith('/v1')) return raw;
  return `${raw}/v1`;
}

async function ensureLlamaReadyForChat(): Promise<void> {
  const health = await fetchHealth(LLAMA_HEALTH_URL);
  if (health.ok) return;
  console.log('[local:smoke] Llama недоступен перед chat-тестом, повторное ожидание...');
  await waitForLlama();
}

function formatFetchError(err: unknown, url: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
  return `Llama smoke fetch failed for ${url}: ${message}${cause}`;
}

async function smokeLlama(): Promise<void> {
  await ensureLlamaReadyForChat();

  const baseUrl = normalizeLlamaBaseUrl(process.env.LLAMACPP_URL || 'http://127.0.0.1:8201/v1');
  const chatUrl = `${baseUrl}/chat/completions`;
  const model = process.env.LLAMACPP_DEFAULT_MODEL || 'qwen2.5-7b-instruct';
  const started = Date.now();
  const payload = {
    model,
    messages: [{ role: 'user', content: 'Ответь одним словом: да' }],
    stream: false,
    max_tokens: 8,
    temperature: 0.1,
  };

  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Llama smoke failed: ${response.status} ${detail.slice(0, 300)}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      console.log('[local:smoke] llama ok', {
        elapsedMs: Date.now() - started,
        preview: String(text).slice(0, 80),
      });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      console.log(
        `[local:smoke] llama chat attempt ${attempt}/${maxAttempts} failed, retrying...`,
        err instanceof Error ? err.message : err
      );
      await ensureLlamaReadyForChat();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error(formatFetchError(lastErr, chatUrl));
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv);

  if (command === 'up') {
    const code = runCompose(['up', '-d', '--build']);
    if (code !== 0) process.exit(code);
    await waitForTei();
    await waitForLlama();
    return;
  }

  if (command === 'down') {
    process.exit(runCompose(['down']));
  }

  if (command === 'status') {
    const code = runCompose(['ps']);
    const teiHealth = await fetchHealth(TEI_HEALTH_URL);
    const llamaHealth = await fetchHealth(LLAMA_HEALTH_URL);
    console.log('[local:status] TEI health', teiHealth);
    console.log('[local:status] Llama health', llamaHealth);
    process.exit(code);
  }

  if (command === 'wait') {
    await waitForTei();
    await waitForLlama();
    return;
  }

  if (command === 'smoke') {
    await waitForTei();
    await waitForLlama();
    await smokeEmbedding();
    await smokeLlama();
  }
}

main().catch((err: unknown) => {
  console.error('[local_stack] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
