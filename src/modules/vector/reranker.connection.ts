import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
const CONFIG_DIR = path.join(__dirname, 'config');

export type ResolvedRerankerSettings = {
  model: string;
  apiUrl?: string;
  enabled: boolean;
  mock: boolean;
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

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

/**
 * Источники (по приоритету):
 * 1. process.env.RERANK_*
 * 2. vector/config/{VECTOR_RERANKER_CONFIG}.env (default: gte_multilingual_reranker_base)
 */
export function resolveRerankerSettings(
  env: NodeJS.ProcessEnv = process.env
): ResolvedRerankerSettings {
  const configId = env.VECTOR_RERANKER_CONFIG || 'gte_multilingual_reranker_base';
  const fileConfig = readVectorConfig(configId);

  return {
    model: env.RERANK_MODEL || fileConfig.RERANK_MODEL || 'gte-multilingual-reranker-base',
    apiUrl: env.RERANK_API_URL?.trim() || fileConfig.RERANK_API_URL?.trim(),
    enabled: parseBoolean(env.RERANK_ENABLED || fileConfig.RERANK_ENABLED, false),
    mock: parseBoolean(env.RERANK_MOCK || fileConfig.RERANK_MOCK, false),
  };
}
