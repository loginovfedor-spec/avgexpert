import fs = require('fs');
import path = require('path');
import dotenv = require('dotenv');

const CONFIG_DIR = path.join(__dirname, 'config');

export type ResolvedEmbeddingSettings = {
  provider: string;
  model: string;
  dimensions: number;
  namespace: string;
  apiUrl?: string;
  apiFormat: 'tei' | 'custom';
  queryPrefix?: string;
};

function readVectorConfig(configId: string): Record<string, string> {
  const envPath = path.join(CONFIG_DIR, `${configId}.env`);
  if (!fs.existsSync(envPath)) return {};
  try {
    return dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  } catch {
    return {};
  }
}

function parseDimensions(raw: string | undefined, fallback: string): number {
  const value = parseInt(raw || fallback, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`EMBEDDING_DIMS должен быть положительным числом, получено: ${raw}`);
  }
  return value;
}

function parseApiFormat(raw: string | undefined): 'tei' | 'custom' {
  if (!raw || raw === 'tei') return 'tei';
  if (raw === 'custom') return 'custom';
  throw new Error(`EMBEDDING_API_FORMAT должен быть tei или custom, получено: ${raw}`);
}

/**
 * Источники (по приоритету):
 * 1. process.env.EMBEDDING_*
 * 2. vector/config/{VECTOR_EMBEDDING_CONFIG}.env (default: bge_m3)
 */
export function resolveEmbeddingSettings(
  env: NodeJS.ProcessEnv = process.env
): ResolvedEmbeddingSettings {
  const configId = env.VECTOR_EMBEDDING_CONFIG || 'bge_m3';
  const fileConfig = readVectorConfig(configId);

  return {
    provider: env.EMBEDDING_PROVIDER || fileConfig.EMBEDDING_PROVIDER || 'self-hosted',
    model: env.EMBEDDING_MODEL || fileConfig.EMBEDDING_MODEL || 'bge-m3',
    dimensions: parseDimensions(env.EMBEDDING_DIMS || fileConfig.EMBEDDING_DIMS, '1024'),
    namespace: env.EMBEDDING_NAMESPACE || fileConfig.EMBEDDING_NAMESPACE || 'bge-m3-v1',
    apiUrl: env.EMBEDDING_API_URL?.trim()
      || env.EMBEDDING_ONNX_PATH?.trim()
      || fileConfig.EMBEDDING_API_URL?.trim(),
    apiFormat: parseApiFormat(env.EMBEDDING_API_FORMAT || fileConfig.EMBEDDING_API_FORMAT),
    queryPrefix: env.EMBEDDING_QUERY_PREFIX || fileConfig.EMBEDDING_QUERY_PREFIX,
  };
}

module.exports = {
  resolveEmbeddingSettings,
};
