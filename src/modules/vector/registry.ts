import type { EmbeddingProvider } from './ports/embedding.provider';
import type { VectorStore } from './ports/vector.store';
import type { EmbeddingConfig, VectorStoreConfig } from './types';
import { createEmbeddingProvider, loadEmbeddingConfig } from './embedding.service';
import { resolvePgConnectionString } from './pg/connection';
import { PgVectorStore } from './stores/pgvector.store';

export function createVectorStore(config: VectorStoreConfig): VectorStore {
  if (config.id !== 'pgvector') {
    throw new Error(`Неизвестный vector store: ${config.id}`);
  }
  return new PgVectorStore({
    connectionString: config.connectionString,
    dimensions: config.dimensions,
  });
}

export function loadVectorStoreConfig(
  env: NodeJS.ProcessEnv = process.env
): VectorStoreConfig {
  const connectionString = resolvePgConnectionString(env);
  if (!connectionString) {
    throw new Error(
      'VECTOR_STORE: DATABASE_URL не задан (process.env или providers/config/*.env)'
    );
  }

  const embeddingConfig = loadEmbeddingConfig(env);
  return {
    id: env.VECTOR_STORE || 'pgvector',
    connectionString,
    dimensions: embeddingConfig.dimensions,
  };
}

export function createVectorStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env
): VectorStore {
  return createVectorStore(loadVectorStoreConfig(env));
}

export function createVectorStackFromEnv(env: NodeJS.ProcessEnv = process.env): {
  embedding: EmbeddingProvider;
  store: VectorStore;
  embeddingConfig: EmbeddingConfig;
} {
  const embeddingConfig = loadEmbeddingConfig(env);
  return {
    embeddingConfig,
    embedding: createEmbeddingProvider(embeddingConfig),
    store: createVectorStoreFromEnv(env),
  };
}

module.exports = {
  createVectorStore,
  loadVectorStoreConfig,
  createVectorStoreFromEnv,
  createVectorStackFromEnv,
};
