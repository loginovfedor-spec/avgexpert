import { createEmbeddingProvider, loadEmbeddingConfig } from './embedding.service';
import { createVectorStoreFromEnv, loadVectorStoreConfig } from './registry';

export type VectorComponentStatus = 'ok' | 'degraded' | 'unavailable';

export interface VectorHealthSection {
  store: VectorComponentStatus;
  embedder: VectorComponentStatus;
  namespace: string;
  dimensions: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkEmbedder(): Promise<VectorComponentStatus> {
  try {
    const config = loadEmbeddingConfig();
    if (config.mock || config.provider === 'mock') {
      return 'ok';
    }
    const provider = createEmbeddingProvider(config);
    await withTimeout(provider.embedQuery('ping'), 5000);
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

async function checkStore(): Promise<VectorComponentStatus> {
  try {
    loadVectorStoreConfig();
    const store = createVectorStoreFromEnv();
    const ok = await store.health();
    return ok ? 'ok' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function getVectorHealthSection(): Promise<VectorHealthSection> {
  let namespace = 'unknown';
  let dimensions = 0;

  try {
    const config = loadEmbeddingConfig();
    namespace = config.namespace;
    dimensions = config.dimensions;
  } catch {
    return {
      store: 'unavailable',
      embedder: 'unavailable',
      namespace,
      dimensions,
    };
  }

  const [store, embedder] = await Promise.all([checkStore(), checkEmbedder()]);
  return { store, embedder, namespace, dimensions };
}

