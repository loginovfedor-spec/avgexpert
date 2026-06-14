import providersConfig from '../../core/providers.config';
import logger from '../../core/logger';
import llamacpp from './adapters/llamacpp';
import openaiGpt41 from './adapters/openai_gpt4_1';
import openaiGpt55 from './adapters/openai_gpt5_5';
import deepseek from './adapters/deepseek';
import google from './adapters/google';
import qwen from './adapters/qwen';
import grok from './adapters/grok';
import yandex from './adapters/yandex';
import yandexFileSearch from './adapters/yandex_file_search';
import { discoverProviders } from './configLoader';

type ProviderAdapter = {
  id: string;
  name?: string;
  adapter?: string;
  models?: string[];
  capabilities?: Record<string, unknown>;
  handleChat?: (messages: unknown[], settings: Record<string, unknown>, options: Record<string, unknown>) => AsyncIterable<unknown>;
  checkHealth?: (config: Record<string, unknown>) => Promise<boolean>;
  getModels?: (config: Record<string, unknown>) => Promise<string[]>;
  [key: string]: unknown;
};

type ListedProvider = {
  id: string;
  name: string;
  adapter: string;
  models: string[];
};

const adapters: Record<string, ProviderAdapter> = {};
const providerFactoryLogger = logger.scoped('ProviderFactory');

const builtins = [
  llamacpp,
  openaiGpt41,
  openaiGpt55,
  deepseek,
  google,
  qwen,
  grok,
  yandex,
  yandexFileSearch,
];

for (const p of builtins) {
  adapters[p.id] = p as unknown as ProviderAdapter;
}

if (process.env.NODE_ENV === 'test') {
  void import('../../../tests/mocks/deterministic_provider.js').then(({ DeterministicProvider }) => {
    const mock = new DeterministicProvider();
    mock.id = 'deterministic';
    adapters['deterministic'] = mock as unknown as ProviderAdapter;
  }).catch((err: unknown) => {
    providerFactoryLogger.warn('Could not load DeterministicProvider for tests', { message: err instanceof Error ? err.message : String(err) });
  });
}

function getProvider(configProviderId: string): ProviderAdapter | null {
  const cfg = providersConfig[configProviderId];
  if (!cfg) return null;
  return adapters[cfg.adapter] || null;
}

function listProviders(): ListedProvider[] {
  const discovered = discoverProviders() as Record<string, {
    name?: string;
    adapter?: string;
    models?: Record<string, unknown>;
  }>;

  const excluded = ['test'];

  return Object.entries(discovered)
    .filter(([id]) => !excluded.includes(id))
    .map(([id, cfg]) => ({
      id,
      name: cfg.name || id,
      adapter: cfg.adapter || id,
      models: Object.keys(cfg.models || {}),
    }));
}

export = { getProvider, listProviders, adapters };
