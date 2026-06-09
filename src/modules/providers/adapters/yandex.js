/**
 * Provider: Yandex Cloud (inject-only LLM adapter for RAG v2)
 * Models: aliceai-llm-flash/latest, aliceai-llm/latest, yandexgpt-5.1
 * Endpoint: https://ai.api.cloud.yandex.net/v1
 *
 * Retrieval/embed/search — RagOrchestrator + TieredRetriever, not this adapter.
 */
const OpenAI = require('openai');
const BaseProvider = require('../base.provider');
const { getAdapterConfig } = require('../configLoader');
const { ProviderUtils } = require('./provider_utils');
const {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
} = require('../llm_response_cache.repository');

class YandexProvider extends BaseProvider {
  constructor() {
    super({
      id: 'yandex',
      name: 'Yandex Cloud',
      models: [
        'aliceai-llm-flash/latest',
        'aliceai-llm/latest',
        'yandexgpt-5.1'
      ],
      defaultModel: 'aliceai-llm-flash/latest',
      capabilities: { stream: true, tools: false }
    });
  }

  _formatModel(model, folderId) {
    if (!model || model === 'default') return `gpt://${folderId}/${this.defaultModel}`;
    if (model.startsWith('gpt://')) {
      if (model.endsWith('/default')) {
        return model.replace('/default', `/${this.defaultModel}`);
      }
      return model;
    }
    const cleanModel = model.includes(':') ? model.substring(model.indexOf(':') + 1) : model;
    if (cleanModel === 'default') return `gpt://${folderId}/${this.defaultModel}`;
    return `gpt://${folderId}/${cleanModel}`;
  }

  _convertMessages(messages) {
    let instructions = '';
    const input = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        instructions += (instructions ? '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        input.push({
          role: 'user',
          content: [{ type: 'input_text', text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        input.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content }]
        });
      }
    }

    return { instructions, input };
  }

  _buildResponseFormat(adapterConfig, categoryConfig) {
    const responseFormat = adapterConfig.YANDEX_CLOUD_RESPONSE_FORMAT || categoryConfig.response_format;
    if (responseFormat !== 'json_schema') return undefined;

    return {
      format: {
        type: 'json_schema',
        name: 'yandex_qa_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            certainty: { type: 'string', enum: ['high', 'medium', 'low'] },
            constraints: { type: 'array', items: { type: 'string' } }
          },
          required: ['answer', 'certainty', 'constraints']
        }
      }
    };
  }

  async *handleChat(messages, categoryConfig, options = {}) {
    const ProviderEvents = require('../providerEvents');
    const { ProviderError } = require('../providerErrors');
    const adapterConfig = getAdapterConfig('yandex');

    const apiKey = adapterConfig.YANDEX_CLOUD_API_KEY || adapterConfig.YANDEX_API_KEY || categoryConfig.api_key;
    const folderId = adapterConfig.YANDEX_CLOUD_FOLDER || adapterConfig.YANDEX_FOLDER_ID || categoryConfig.yandex_folder_id;
    const baseUrl = adapterConfig.YANDEX_CLOUD_BASE_URL || this.defaultBaseUrl || 'https://ai.api.cloud.yandex.net/v1';

    if (!apiKey) {
      throw new ProviderError('Yandex Cloud: API key не задан. Укажите YANDEX_CLOUD_API_KEY в yandex.env.', 401);
    }
    if (!folderId) {
      throw new ProviderError('Yandex Cloud: YANDEX_CLOUD_FOLDER не задан. Укажите YANDEX_CLOUD_FOLDER в yandex.env.', 400);
    }

    const { instructions, input } = this._convertMessages(messages);
    const targetModel = this._formatModel(
      categoryConfig.model_name || adapterConfig.YANDEX_CLOUD_MODEL || this.defaultModel,
      folderId
    );

    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: {
        'OpenAI-Project': folderId
      }
    });

    const params = {
      model: targetModel,
      input,
      stream: !!options.stream
    };

    if (instructions) params.instructions = instructions;

    const temperature = categoryConfig.temperature !== undefined
      ? categoryConfig.temperature
      : parseFloat(adapterConfig.YANDEX_CLOUD_TEMPERATURE || '0.3');
    if (temperature !== undefined) params.temperature = temperature;

    const maxTokens = options.max_tokens || parseInt(adapterConfig.YANDEX_CLOUD_MAX_OUTPUT_TOKENS || '500', 10);
    if (maxTokens) params.max_output_tokens = maxTokens;

    if (categoryConfig.top_p !== undefined) params.top_p = categoryConfig.top_p;
    if (categoryConfig.parallel_tool_calls !== undefined) params.parallel_tool_calls = categoryConfig.parallel_tool_calls;
    if (categoryConfig.reasoning !== undefined) params.reasoning = categoryConfig.reasoning;
    if (categoryConfig.store !== undefined) params.store = categoryConfig.store;
    if (categoryConfig.text !== undefined) params.text = categoryConfig.text;
    if (categoryConfig.tool_choice !== undefined) params.tool_choice = categoryConfig.tool_choice;
    if (categoryConfig.tools !== undefined || options.tools !== undefined) params.tools = categoryConfig.tools || options.tools;
    if (categoryConfig.truncation !== undefined) params.truncation = categoryConfig.truncation;
    if (categoryConfig.user !== undefined) params.user = categoryConfig.user;
    if (categoryConfig.metadata !== undefined) params.metadata = categoryConfig.metadata;

    const responseFormat = this._buildResponseFormat(adapterConfig, categoryConfig);
    if (responseFormat) params.text = responseFormat;

    ProviderUtils.cleanUnsupportedParams(params, ['reasoning', 'reasoning_effort']);

    if (categoryConfig.debug_mode) {
      this._pushDebugLog(categoryConfig, 'debug', `YANDEX REQUEST: ${JSON.stringify({ model: targetModel, stream: params.stream }, null, 2)}`);
    }

    const cacheKey = generateCacheKey(this.id, {
      model: targetModel,
      input,
      instructions,
      text: params.text,
      temperature: params.temperature,
      max_output_tokens: params.max_output_tokens,
    });
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      yield ProviderEvents.delta(cached.response_text);
      yield ProviderEvents.done('stop', cached.usage);
      return;
    }

    try {
      if (params.stream) {
        const stream = await client.responses.create(params);
        let fullContent = '';
        let finalUsage = null;
        let lastFinishReason = 'stop';

        for await (const chunk of stream) {
          if (chunk.type === 'response.output_text.delta') {
            fullContent += chunk.delta;
            yield ProviderEvents.delta(chunk.delta);
          }
          if (chunk.type === 'response.completed') {
            lastFinishReason = chunk.response?.finish_reason || 'stop';
            if (chunk.response?.usage) {
              finalUsage = chunk.response.usage;
            }
          }
        }

        const usageToCache = ProviderUtils.normalizeUsage(finalUsage)
          || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        if (fullContent) {
          setCachedResponse(cacheKey, this.id, fullContent, usageToCache);
        }
        yield ProviderEvents.done(lastFinishReason, usageToCache);
      } else {
        const response = await client.responses.create(params);
        let text = '';
        if (response.output) {
          for (const item of response.output) {
            if (item.type === 'message' && item.content) {
              for (const part of item.content) {
                if (part.type === 'output_text') text += part.text;
              }
            }
          }
        }

        const usage = ProviderUtils.normalizeUsage(response.usage)
          || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        if (text) {
          setCachedResponse(cacheKey, this.id, text, usage);
          yield ProviderEvents.delta(text);
        }
        yield ProviderEvents.done(response.finish_reason || 'stop', usage);
      }
    } catch (err) {
      throw new ProviderError(`Yandex Cloud: ${err.message}`, 502);
    }
  }

  async checkHealth(categoryConfig) {
    const adapterConfig = getAdapterConfig('yandex');
    const apiKey = adapterConfig.YANDEX_CLOUD_API_KEY || categoryConfig?.api_key;
    const folderId = adapterConfig.YANDEX_CLOUD_FOLDER || categoryConfig?.yandex_folder_id;
    const baseUrl = adapterConfig.YANDEX_CLOUD_BASE_URL || 'https://ai.api.cloud.yandex.net/v1';

    if (!apiKey || !folderId) return false;

    try {
      const client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
        defaultHeaders: { 'OpenAI-Project': folderId },
        timeout: 5000,
        maxRetries: 0,
      });
      const response = await client.responses.create({
        model: this._formatModel(this.defaultModel, folderId),
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
        max_output_tokens: 5,
      });
      return Boolean(response);
    } catch {
      return false;
    }
  }
}

const instance = new YandexProvider();
module.exports = instance;
