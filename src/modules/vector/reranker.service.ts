import type { RerankerProvider } from './ports/reranker.provider';
import type { RetrievalTier } from './types';
import { SelfHostedRerankerProvider } from './providers/selfhosted.reranker';
import { MockRerankerProvider } from './providers/mock.reranker';
import { resolveRerankerSettings } from './reranker.connection';

export type RerankerConfig = {
  model: string;
  apiUrl?: string;
  enabled: boolean;
  mock: boolean;
};

export function loadRerankerConfig(env: NodeJS.ProcessEnv = process.env): RerankerConfig {
  const resolved = resolveRerankerSettings(env);
  return {
    model: resolved.model,
    apiUrl: resolved.apiUrl,
    enabled: resolved.enabled,
    mock: resolved.mock,
  };
}

export function shouldRerankTier(tier: RetrievalTier): boolean {
  return tier === 'expert' || tier === 'sage';
}

export function createRerankerProvider(config: RerankerConfig): RerankerProvider | null {
  if (!config.enabled) return null;

  if (config.mock) {
    return new MockRerankerProvider({ model: config.model });
  }

  if (!config.apiUrl) {
    throw new Error(
      'Self-hosted reranker (§11.2 S7b): задайте RERANK_API_URL в .env или vector/config/bge_reranker_v2_m3.env, либо RERANK_MOCK=true'
    );
  }

  return new SelfHostedRerankerProvider({
    id: 'self-hosted-reranker',
    model: config.model,
    apiUrl: config.apiUrl,
  });
}

export function createRerankerProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): RerankerProvider | null {
  return createRerankerProvider(loadRerankerConfig(env));
}

module.exports = {
  loadRerankerConfig,
  shouldRerankTier,
  createRerankerProvider,
  createRerankerProviderFromEnv,
};
