import path from 'path';
import dotenv from 'dotenv';
import { loadEmbeddingConfig, createEmbeddingProviderFromEnv } from '../src/modules/vector/embedding.service';
import { resolveEmbeddingSettings } from '../src/modules/vector/embedding.connection';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const settings = resolveEmbeddingSettings();
  const config = loadEmbeddingConfig();

  console.log('[embedding:smoke] config', {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    namespace: config.namespace,
    apiUrl: config.apiUrl,
    apiFormat: config.apiFormat,
    mock: config.mock,
    vectorConfig: process.env.VECTOR_EMBEDDING_CONFIG || 'bge_m3',
  });

  if (config.mock) {
    console.log('[embedding:smoke] EMBEDDING_MOCK=true — live endpoint не проверяется');
    return;
  }

  if (!settings.apiUrl) {
    throw new Error('EMBEDDING_API_URL не задан (см. vector/config/bge_m3.env)');
  }

  const provider = createEmbeddingProviderFromEnv();
  const started = Date.now();
  const vector = await provider.embedQuery('smoke ping vector kb');
  const elapsedMs = Date.now() - started;

  console.log('[embedding:smoke] ok', {
    dims: vector.length,
    elapsedMs,
    sample: vector.slice(0, 3).map(v => Number(v.toFixed(6))),
  });
}

main().catch((err: unknown) => {
  console.error('[embedding:smoke] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
