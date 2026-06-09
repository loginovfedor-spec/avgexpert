import type { EmbeddingProvider } from './ports/embedding.provider';
import type { EmbeddingConfig } from './types';
import { MockEmbeddingProvider } from './providers/mock.embedding';
import { SelfHostedEmbeddingProvider } from './providers/selfhosted.embedding';

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function loadEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const dimensions = parseInt(env.EMBEDDING_DIMS || '1024', 10);
  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    throw new Error(`EMBEDDING_DIMS должен быть положительным числом, получено: ${env.EMBEDDING_DIMS}`);
  }

  return {
    provider: env.EMBEDDING_PROVIDER || 'self-hosted',
    model: env.EMBEDDING_MODEL || 'bge-m3',
    dimensions,
    namespace: env.EMBEDDING_NAMESPACE || 'bge-m3-v1',
    apiUrl: env.EMBEDDING_API_URL || env.EMBEDDING_ONNX_PATH,
    mock: parseBoolean(env.EMBEDDING_MOCK, false),
  };
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (config.mock || config.provider === 'mock') {
    return new MockEmbeddingProvider({
      id: 'mock',
      model: config.model,
      dimensions: config.dimensions,
    });
  }

  if (!config.apiUrl) {
    throw new Error(
      'Self-hosted embedder: задайте EMBEDDING_API_URL (HTTP inference endpoint) или EMBEDDING_MOCK=true для dev/test'
    );
  }

  return new SelfHostedEmbeddingProvider({
    id: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    apiUrl: config.apiUrl,
  });
}

export function createEmbeddingProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): EmbeddingProvider {
  return createEmbeddingProvider(loadEmbeddingConfig(env));
}

module.exports = {
  loadEmbeddingConfig,
  createEmbeddingProvider,
  createEmbeddingProviderFromEnv,
};
