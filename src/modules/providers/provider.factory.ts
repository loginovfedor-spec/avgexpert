const providersConfig = require('../../core/providers.config');
import logger = require('../../core/logger');

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
  require('./adapters/llamacpp'),
  require('./adapters/openai_gpt4_1'),
  require('./adapters/openai_gpt5_5'),
  require('./adapters/deepseek'),
  require('./adapters/google'),
  require('./adapters/qwen'),
  require('./adapters/grok'),
  require('./adapters/yandex'),
  require('./adapters/yandex_file_search'),
];

for (const p of builtins) {
  adapters[p.id] = p;
}

if (process.env.NODE_ENV === 'test') {
  try {
    const { DeterministicProvider } = require('../../../tests/mocks/deterministic_provider');
    const mock = new DeterministicProvider();
    mock.id = 'deterministic'; 
    adapters['deterministic'] = mock;
  } catch (err: unknown) {
    providerFactoryLogger.warn('Could not load DeterministicProvider for tests', { message: err instanceof Error ? err.message : String(err) });
  }
}

function getProvider(configProviderId: string): ProviderAdapter | null {
  const cfg = providersConfig[configProviderId];
  if (!cfg) return null;
  return adapters[cfg.adapter] || null;
}

function listProviders(): ListedProvider[] {
  const { discoverProviders } = require('./configLoader');
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
