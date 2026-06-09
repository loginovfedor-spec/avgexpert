/**
 * Provider: Yandex Cloud
 * Models: aliceai-llm-flash/latest, aliceai-llm/latest, yandexgpt-5.1
 * Endpoint: https://ai.api.cloud.yandex.net/v1
 */
const BaseProvider = require('../base.provider');
const { getAdapterConfig } = require('../configLoader');
const fetch = require('node-fetch');

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

  /**
   * Helper to format Yandex model identifier
   */
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

  /**
   * Converts messages to Yandex format (instructions + input)
   */
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

  /**
   * Handle chat request
   */
  async *handleChat(messages, categoryConfig, options) {
    const ProviderEvents = require('../providerEvents');
    const { ProviderError } = require('../providerErrors');
    
    // Load config from yandex.env / process.env
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
    const model = this._formatModel(categoryConfig.model_name || adapterConfig.YANDEX_CLOUD_MODEL || this.defaultModel, folderId);

    const body = {
      model,
      input
    };

    if (instructions) {
      body.instructions = instructions;
    }

    // Generation parameters
    const temperature = categoryConfig.temperature !== undefined ? categoryConfig.temperature : parseFloat(adapterConfig.YANDEX_CLOUD_TEMPERATURE || '0.3');
    if (temperature !== undefined) {
      body.temperature = temperature;
    }

    const maxTokens = options.max_tokens || parseInt(adapterConfig.YANDEX_CLOUD_MAX_OUTPUT_TOKENS || '500');
    if (maxTokens) {
      body.max_output_tokens = maxTokens;
    }

    if (categoryConfig.top_p !== undefined) body.top_p = categoryConfig.top_p;
    if (categoryConfig.parallel_tool_calls !== undefined) body.parallel_tool_calls = categoryConfig.parallel_tool_calls;
    if (categoryConfig.reasoning !== undefined) body.reasoning = categoryConfig.reasoning;
    if (categoryConfig.store !== undefined) body.store = categoryConfig.store;
    if (categoryConfig.text !== undefined) body.text = categoryConfig.text;
    if (categoryConfig.tool_choice !== undefined) body.tool_choice = categoryConfig.tool_choice;
    if (categoryConfig.tools !== undefined || options.tools !== undefined) body.tools = categoryConfig.tools || options.tools;
    if (categoryConfig.truncation !== undefined) body.truncation = categoryConfig.truncation;
    if (categoryConfig.user !== undefined) body.user = categoryConfig.user;
    if (categoryConfig.metadata !== undefined) body.metadata = categoryConfig.metadata;

    // Set response format to json_schema if requested
    const responseFormat = adapterConfig.YANDEX_CLOUD_RESPONSE_FORMAT || categoryConfig.response_format;
    if (responseFormat === 'json_schema') {
      body.text = {
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

    const url = `${baseUrl}/responses`;
    const headers = {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'OpenAI-Project': folderId
    };

    if (categoryConfig.debug_mode) {
      this._pushDebugLog(categoryConfig, 'debug', `YANDEX REQUEST: ${JSON.stringify({ url, body }, null, 2)}`);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Yandex API Error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      
      // Yandex Responses API non-streaming parsing (Alice/Responses)
      let text = '';
      if (data.output) {
        for (const item of data.output) {
          if (item.type === 'message' && item.content) {
            for (const part of item.content) {
              if (part.type === 'output_text') text += part.text;
            }
          }
        }
      }

      const usage = data.usage ? {
        prompt_tokens: data.usage.input_tokens || 0,
        completion_tokens: data.usage.output_tokens || 0,
        total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      if (text) {
        yield ProviderEvents.delta(text);
      }
      yield ProviderEvents.done('stop', usage);

    } catch (err) {
      throw new ProviderError(`Yandex Cloud: ${err.message}`, 502);
    }
  }

  async checkHealth(categoryConfig) {
    const adapterConfig = getAdapterConfig('yandex');
    const apiKey = adapterConfig.YANDEX_CLOUD_API_KEY || categoryConfig.api_key;
    const folderId = adapterConfig.YANDEX_CLOUD_FOLDER || categoryConfig.yandex_folder_id;
    const baseUrl = adapterConfig.YANDEX_CLOUD_BASE_URL || 'https://ai.api.cloud.yandex.net/v1';

    if (!apiKey || !folderId) return false;

    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'OpenAI-Project': folderId
        },
        body: JSON.stringify({
          model: this._formatModel(this.defaultModel, folderId),
          input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
          max_output_tokens: 5
        })
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }
}

const instance = new YandexProvider();
module.exports = instance;
