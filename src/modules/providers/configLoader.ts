import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import logger from '../../core/logger';
const configLoaderLogger = logger.scoped('ConfigLoader');

type ProviderModelConfig = {
  name: string;
  extra_params: Record<string, unknown>;
};

type ProviderExtraParams = Record<string, unknown> & {
  prompt?: {
    id: string;
    version?: string;
  };
  vector_store_ids?: string[];
  tools?: Array<Record<string, unknown>>;
};

type DiscoveredProvider = {
  name: string;
  adapter: string;
  endpoint_url: string;
  api_key: string;
  defaultModel: string;
  yandex_folder_id: string;
  extra_params: ProviderExtraParams;
  models: Record<string, ProviderModelConfig>;
  _env: Record<string, string>;
};

export function discoverProviders(): Record<string, DiscoveredProvider> {
  const configDir = path.join(__dirname, 'config');
  const providers: Record<string, DiscoveredProvider> = {};

  if (!fs.existsSync(configDir)) {
    return providers;
  }

  const files = fs.readdirSync(configDir).filter(f => f.endsWith('.env'));
  for (const file of files) {
    const providerId = path.basename(file, '.env');
    const envPath = path.join(configDir, file);
    try {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      const providerName = parsed.PROVIDER_NAME || parsed.PROVIDER_DISPLAY_NAME || providerId.split(/[_-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      const adapterType = parsed.ADAPTER_TYPE || parsed.AI_PROVIDER || providerId.split('_')[0];

      const defaultModel = parsed.DEFAULT_MODEL || parsed.OPENAI_DEFAULT_MODEL || parsed.YANDEX_DEFAULT_MODEL || parsed.LLAMACPP_DEFAULT_MODEL || parsed.YANDEX_CLOUD_MODEL || parsed.GEMINI_DEFAULT_MODEL || parsed.DEEPSEEK_DEFAULT_MODEL || parsed.QWEN_DEFAULT_MODEL || parsed.GROK_DEFAULT_MODEL || 'default';
      const models: Record<string, ProviderModelConfig> = {};
      models[defaultModel] = { name: defaultModel, extra_params: {} };

      if (parsed.MODELS) {
        parsed.MODELS.split(',').map(m => m.trim()).forEach(m => {
          models[m] = { name: m, extra_params: {} };
        });
      }

      const extra_params: ProviderExtraParams = {};
      if (parsed.PROMPT_ID) {
        extra_params.prompt = {
          id: parsed.PROMPT_ID
        };
        if (parsed.PROMPT_VERSION) {
          extra_params.prompt.version = parsed.PROMPT_VERSION;
        }
      }
      if (parsed.VECTOR_STORE_IDS && parsed.VECTOR_STORE_IDS.trim() !== '' && parsed.VECTOR_STORE_IDS.trim().toLowerCase() !== 'null') {
        extra_params.vector_store_ids = parsed.VECTOR_STORE_IDS.split(',').map(id => id.trim()).filter(id => id !== '' && id.toLowerCase() !== 'null');
        if (extra_params.vector_store_ids.length > 0) {
          if (!extra_params.tools) extra_params.tools = [];
          extra_params.tools.push({
            type: 'file_search',
            vector_store_ids: extra_params.vector_store_ids
          });
        }
      }
      if (parsed.WEB_SEARCH_ENABLED === 'true') {
        if (!extra_params.tools) extra_params.tools = [];
        extra_params.tools.push({
          type: 'web_search'
        });
      }
      if (parsed.IMAGE_UPLOAD_ENABLED === 'true') {
        extra_params.vision_enabled = true;
      }
      if (parsed.MAX_OUTPUT_GENERATION_TOKENS) {
        extra_params.max_tokens = parseInt(parsed.MAX_OUTPUT_GENERATION_TOKENS, 10);
      } else if (parsed.MAX_OUTPUT_TOKENS) {
        extra_params.max_tokens = parseInt(parsed.MAX_OUTPUT_TOKENS, 10);
      }
      if (parsed.STORE) {
        extra_params.store = parsed.STORE === 'true';
      }
      if (parsed.INCLUDE) {
        extra_params.include = parsed.INCLUDE.split(',').map(s => s.trim());
      }
      if (parsed.TEMPERATURE !== undefined) {
        extra_params.temperature = parseFloat(parsed.TEMPERATURE);
      }
      if (parsed.TOP_P !== undefined) {
        extra_params.top_p = parseFloat(parsed.TOP_P);
      }
      if (parsed.TOP_K !== undefined) {
        extra_params.top_k = parseInt(parsed.TOP_K, 10);
      }
      if (parsed.MIN_P !== undefined) {
        extra_params.min_p = parseFloat(parsed.MIN_P);
      }
      if (parsed.REPEAT_PENALTY !== undefined) {
        extra_params.repeat_penalty = parseFloat(parsed.REPEAT_PENALTY);
      }
      if (parsed.N_PREDICT !== undefined) {
        extra_params.n_predict = parseInt(parsed.N_PREDICT, 10);
      }
      if (parsed.PROMPT_CACHE_KEY !== undefined) {
        extra_params.prompt_cache_key = parsed.PROMPT_CACHE_KEY;
      }
      if (parsed.PROMPT_CACHE_RETENTION !== undefined) {
        extra_params.prompt_cache_retention = parsed.PROMPT_CACHE_RETENTION.replace('-', '_');
      }
      if (parsed.REASONING_EFFORT !== undefined && parsed.REASONING_EFFORT.trim() !== '') {
        const reasoning = (extra_params.reasoning && typeof extra_params.reasoning === 'object')
          ? { ...(extra_params.reasoning as Record<string, unknown>) }
          : {};
        reasoning.effort = parsed.REASONING_EFFORT.trim();
        extra_params.reasoning = reasoning;
      }

      providers[providerId] = {
        name: providerName,
        adapter: adapterType,
        endpoint_url: parsed.OPENAI_URL || parsed.DEEPSEEK_URL || parsed.QWEN_URL || parsed.GROK_URL || parsed.LLAMACPP_URL || parsed.YANDEX_CLOUD_BASE_URL || "",
        api_key: parsed.OPENAI_API_KEY || parsed.DEEPSEEK_API_KEY || parsed.QWEN_API_KEY || parsed.GROK_API_KEY || parsed.LLAMACPP_API_KEY || parsed.YANDEX_CLOUD_API_KEY || parsed.YANDEX_API_KEY || parsed.GEMINI_API_KEY || "",
        defaultModel: defaultModel,
        yandex_folder_id: parsed.YANDEX_CLOUD_FOLDER || parsed.YANDEX_FOLDER_ID || "",
        extra_params: extra_params,
        models,
        _env: parsed
      };
    } catch (err: unknown) {
      configLoaderLogger.error('Error loading provider config', { file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return providers;
}

export function getAdapterConfig(providerId: string): Record<string, unknown> {
  const discovered = discoverProviders();
  let fileConfig: Record<string, string> = {};
  let adapterType = providerId.split('_')[0];

  if (discovered[providerId]) {
    fileConfig = discovered[providerId]._env;
    adapterType = discovered[providerId].adapter;
  } else {
    const envPath = path.join(__dirname, 'config', `${providerId}.env`);
    if (fs.existsSync(envPath)) {
      try {
        fileConfig = dotenv.parse(fs.readFileSync(envPath));
      } catch (err) {
        configLoaderLogger.warn('Failed to parse provider env file', {
          providerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const result: Record<string, unknown> = { ...fileConfig };
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith(adapterType.toUpperCase() + '_') || key === 'YANDEX_API_KEY' || key === 'YANDEX_FOLDER_ID') {
      result[key] = val;
    }
  }

  return result;
}

