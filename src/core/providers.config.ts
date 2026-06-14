import { discoverProviders, getAdapterConfig } from '../modules/providers/configLoader';
import logger from './logger';
const providersConfigLogger = logger.scoped('ProvidersConfig');

type ProviderModelConfig = {
  name: string;
  extra_params?: Record<string, unknown>;
};

type ProviderConfigEntry = {
  name: string;
  adapter: string;
  endpoint_url: string;
  api_key: string;
  defaultModel: string;
  extra_params?: Record<string, unknown>;
  models: Record<string, ProviderModelConfig>;
  yandex_folder_id?: string;
  allow_local?: boolean;
  _env?: Record<string, string>;
};

function envStr(env: Record<string, unknown>, key: string, fallback = ''): string {
  const value = env[key];
  return typeof value === 'string' ? value : fallback;
}

const openaiEnv = getAdapterConfig('openai');
const deepseekEnv = getAdapterConfig('deepseek');
const llamacppEnv = getAdapterConfig('llamacpp');
const googleEnv = getAdapterConfig('google');
const qwenEnv = getAdapterConfig('qwen');
const grokEnv = getAdapterConfig('grok');
const yandexEnv = getAdapterConfig('yandex');

const providersConfig: Record<string, ProviderConfigEntry> = {
  llamacpp: {
    name: 'Локальная LLM (Llama.cpp)',
    adapter: 'llamacpp',
    endpoint_url: envStr(llamacppEnv, 'LLAMACPP_URL', 'http://127.0.0.1:8201/v1'),
    api_key: envStr(llamacppEnv, 'LLAMACPP_API_KEY'),
    defaultModel: envStr(llamacppEnv, 'LLAMACPP_DEFAULT_MODEL', 'qwen2.5-7b-instruct'),
    extra_params: {},
    models: {
      'qwen2.5-7b-instruct': { name: 'Qwen2.5 7B Instruct (local)', extra_params: {} },
      default: { name: 'Модель по умолчанию', extra_params: {} },
    },
  },
  openai: {
    name: 'OpenAI API',
    adapter: 'openai_gpt4_1',
    endpoint_url: envStr(openaiEnv, 'OPENAI_URL', 'https://api.openai.com/v1'),
    api_key: envStr(openaiEnv, 'OPENAI_API_KEY'),
    defaultModel: 'gpt-4o-mini',
    extra_params: {},
    models: {
      'gpt-4.1': { name: 'GPT-4.1', extra_params: {} },
      'gpt-4.1-mini': { name: 'GPT-4.1 Mini', extra_params: {} },
      'gpt-4o': { name: 'GPT-4 Omni', extra_params: {} },
      'gpt-4o-mini': { name: 'GPT-4 Omni Mini', extra_params: {} },
    },
  },
  openai_responses: {
    name: 'OpenAI Responses API',
    adapter: 'openai_responses',
    endpoint_url: envStr(openaiEnv, 'OPENAI_URL', 'https://api.openai.com/v1'),
    api_key: envStr(openaiEnv, 'OPENAI_RESPONSES_KEY') || envStr(openaiEnv, 'OPENAI_API_KEY'),
    defaultModel: 'gpt-4.1',
    extra_params: {},
    models: {
      'gpt-4.1': { name: 'GPT-4.1 (Responses API)', extra_params: {} },
      'gpt-4.1-mini': { name: 'GPT-4.1 Mini (Responses API)', extra_params: {} },
    },
  },
  openai_prompt_file_search: {
    name: 'OpenAI Prompt + File Search',
    adapter: 'openai_prompt_file_search',
    endpoint_url: '',
    api_key: envStr(openaiEnv, 'OPENAI_RESPONSES_KEY') || envStr(openaiEnv, 'OPENAI_API_KEY'),
    defaultModel: 'openai_prompt_file_search:prompt',
    extra_params: {
      prompt: {
        id: 'pmpt_69fe0facab7c8190845f8e803d634d9f0986bd6fdbb91195',
        version: '2',
      },
      reasoning: {
        summary: 'auto',
      },
      tools: [
        {
          type: 'file_search',
          vector_store_ids: ['vs_69fe0ce2642c819193ff2bc7478ce2bf'],
        },
      ],
      store: true,
      include: ['reasoning.encrypted_content', 'web_search_call.action.sources'],
    },
    models: {
      'openai_prompt_file_search:prompt': {
        name: 'Stored Prompt v2 + File Search',
        extra_params: {},
      },
    },
  },
  deepseek: {
    name: 'DeepSeek',
    adapter: 'deepseek',
    endpoint_url: envStr(deepseekEnv, 'DEEPSEEK_URL', 'https://api.deepseek.com/v1'),
    api_key: envStr(deepseekEnv, 'DEEPSEEK_API_KEY'),
    defaultModel: 'deepseek-chat',
    extra_params: {},
    models: {
      'deepseek-chat': { name: 'DeepSeek Chat', extra_params: {} },
      'deepseek-reasoner': { name: 'DeepSeek Reasoner', extra_params: {} },
    },
  },
  google: {
    name: 'Google Gemini',
    adapter: 'google',
    endpoint_url: '',
    api_key: envStr(googleEnv, 'GEMINI_API_KEY'),
    defaultModel: 'gemini-2.5-flash',
    extra_params: {},
    models: {
      'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', extra_params: {} },
      'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', extra_params: {} },
    },
  },
  qwen: {
    name: 'Qwen (DashScope)',
    adapter: 'qwen',
    endpoint_url: envStr(qwenEnv, 'QWEN_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
    api_key: envStr(qwenEnv, 'QWEN_API_KEY'),
    defaultModel: 'qwen-plus',
    extra_params: {},
    models: {
      'qwen-plus': { name: 'Qwen Plus', extra_params: {} },
      'qwen-turbo': { name: 'Qwen Turbo', extra_params: {} },
    },
  },
  grok: {
    name: 'Grok (xAI)',
    adapter: 'grok',
    endpoint_url: envStr(grokEnv, 'GROK_URL', 'https://api.x.ai/v1'),
    api_key: envStr(grokEnv, 'GROK_API_KEY'),
    defaultModel: 'grok-3',
    extra_params: {},
    models: {
      'grok-4-1-fast-non-reasoning': { name: 'Grok 4.1 Fast (Non-reasoning)', extra_params: {} },
      'grok-4-1-fast-reasoning': { name: 'Grok 4.1 Fast', extra_params: {} },
      'grok-3-mini': { name: 'Grok 3 mini', extra_params: {} },
      'grok-3': { name: 'Grok 3', extra_params: {} },
    },
  },
  yandex: {
    name: 'Yandex Cloud',
    adapter: 'yandex',
    endpoint_url: envStr(yandexEnv, 'YANDEX_CLOUD_BASE_URL', 'https://ai.api.cloud.yandex.net/v1'),
    api_key: envStr(yandexEnv, 'YANDEX_CLOUD_API_KEY') || envStr(yandexEnv, 'YANDEX_API_KEY'),
    yandex_folder_id: envStr(yandexEnv, 'YANDEX_CLOUD_FOLDER') || envStr(yandexEnv, 'YANDEX_FOLDER_ID'),
    defaultModel: 'aliceai-llm-flash/latest',
    extra_params: {},
    models: {
      'aliceai-llm-flash/latest': { name: 'Alice LLM Flash', extra_params: {} },
      'aliceai-llm/latest': { name: 'Alice LLM Pro', extra_params: {} },
      'yandexgpt-5.1': { name: 'YandexGPT 5.1', extra_params: {} },
    },
  },
  test: {
    name: 'Test Deterministic Provider',
    adapter: 'deterministic',
    endpoint_url: 'http://localhost:8201',
    allow_local: true,
    api_key: 'test',
    defaultModel: 'mock',
    models: {
      mock: { name: 'Mock Model' },
    },
  },
};

try {
  const discovered = discoverProviders();
  for (const [id, cfg] of Object.entries(discovered)) {
    if (!providersConfig[id]) {
      providersConfig[id] = cfg;
    } else {
      const existing = providersConfig[id];
      existing.name = cfg.name || existing.name;
      existing.adapter = cfg.adapter || existing.adapter;
      existing.endpoint_url = cfg.endpoint_url || existing.endpoint_url;
      existing.api_key = cfg.api_key || existing.api_key;
      existing.defaultModel = cfg.defaultModel || existing.defaultModel;
      existing.models = { ...existing.models, ...cfg.models };
      existing.extra_params = { ...existing.extra_params, ...cfg.extra_params };
      existing._env = cfg._env || existing._env;
    }
  }
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  providersConfigLogger.error('Error merging discovered providers', { message });
}

export = providersConfig;
