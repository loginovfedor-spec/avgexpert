import type { EmbeddingProvider } from './ports/embedding.provider';
import type { EmbeddingConfig } from './types';
import { MockEmbeddingProvider } from './providers/mock.embedding';
import { SelfHostedEmbeddingProvider } from './providers/selfhosted.embedding';
import { resolveEmbeddingSettings } from './embedding.connection';

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function loadEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const resolved = resolveEmbeddingSettings(env);
  return {
    provider: resolved.provider,
    model: resolved.model,
    dimensions: resolved.dimensions,
    namespace: resolved.namespace,
    apiUrl: resolved.apiUrl,
    apiFormat: resolved.apiFormat,
    queryPrefix: resolved.queryPrefix,
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
      'Self-hosted embedder (§11.1): задайте EMBEDDING_API_URL в .env или vector/config/bge_m3.env, либо EMBEDDING_MOCK=true'
    );
  }

  return new SelfHostedEmbeddingProvider({
    id: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    apiUrl: config.apiUrl,
    apiFormat: config.apiFormat,
    queryPrefix: config.queryPrefix,
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
