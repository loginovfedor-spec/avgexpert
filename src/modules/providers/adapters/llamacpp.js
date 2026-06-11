/**
 * Provider: LlamaCpp
 * Native implementation for local LLMs via Llama.cpp server (OpenAI-compatible API).
 */
const BaseProvider = require('../base.provider');
const { ProviderUtils } = require('./provider_utils');

const PROVIDER_STRIP_KEYS = new Set([
  'global_kb_enabled',
  'user_kb_enabled',
  'session_kb_enabled',
  'rag_mode',
  'rag_answerability_policy',
  'endpoint_url',
  'api_key',
  'vector_store_ids',
  'tools',
  'prompt',
  'store',
  'include',
  'vision_enabled',
  'collection_ids',
  'GROK_COLLECTION_IDS',
  'enable_search',
  'file_search',
]);

function stripProviderExtraParams(extraParams = {}) {
  const cleaned = { ...extraParams };
  for (const key of PROVIDER_STRIP_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

class LlamaCppProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      id: config.id || 'llamacpp',
      name: config.name || 'Llama.cpp',
      models: config.models || ['qwen2.5-7b-instruct'],
      defaultModel: config.defaultModel || 'qwen2.5-7b-instruct',
      capabilities: Object.assign(
        { stream: true, tools: false, retrieval: true },
        config.capabilities
      ),
    });
    this.defaultBaseUrl = config.defaultBaseUrl || 'http://127.0.0.1:8201/v1';
  }

  normalizeBaseUrl(endpointUrl) {
    const raw = String(endpointUrl || this.defaultBaseUrl).trim().replace(/\/+$/, '');
    if (raw.endsWith('/v1')) return raw;
    return `${raw}/v1`;
  }

  resolveHealthUrl(config = {}) {
    const base = String(config.endpoint_url || this.defaultBaseUrl).trim().replace(/\/+$/, '');
    if (base.endsWith('/v1')) {
      return base.replace(/\/v1$/, '/health');
    }
    return `${base}/health`;
  }

  buildCompletionParams(config = {}, options = {}) {
    const params = {
      model: config.model_name || config.defaultModel || this.defaultModel,
      messages: config._messages || [],
      stream: !!options.stream,
    };

    const cleanedExtra = stripProviderExtraParams(config.extra_params || {});
    for (const [key, value] of Object.entries(cleanedExtra)) {
      if (value === undefined || value === null) continue;
      params[key] = value;
    }

    if (options.max_tokens) params.max_tokens = options.max_tokens;
    if (config.temperature !== undefined) params.temperature = config.temperature;
    if (config.top_p !== undefined) params.top_p = config.top_p;
    if (config.top_k !== undefined) params.top_k = config.top_k;
    if (config.min_p !== undefined) params.min_p = config.min_p;
    if (config.repeat_penalty !== undefined) params.repeat_penalty = config.repeat_penalty;
    if (config.n_predict !== undefined) params.n_predict = config.n_predict;

    return params;
  }

  async *handleChat(messages, config, options = {}) {
    const ProviderEvents = require('../providerEvents');
    const params = this.buildCompletionParams(
      { ...config, _messages: messages },
      options
    );

    const headers = { 'Content-Type': 'application/json' };
    if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;

    const url = `${this.normalizeBaseUrl(config.endpoint_url)}/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: options.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`LlamaCpp API Error: ${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
      }

      if (params.stream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let finalUsage = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (let line of lines) {
            line = line.trim();
            if (!line || line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.usage) finalUsage = data.usage;
                const choice = data.choices?.[0];
                if (!choice) continue;
                if (choice.delta?.content) yield ProviderEvents.delta(choice.delta.content);
                if (choice.delta?.tool_calls) yield ProviderEvents.toolCall(choice.delta.tool_calls);
              } catch (_e) {
                // ignore malformed SSE chunks
              }
            }
          }
        }
        yield ProviderEvents.done('stop', ProviderUtils.normalizeUsage(finalUsage));
      } else {
        const data = await response.json();
        const choice = data.choices?.[0];
        if (choice?.message?.content) yield ProviderEvents.delta(choice.message.content);
        if (choice?.message?.tool_calls) yield ProviderEvents.toolCall(choice.message.tool_calls);
        yield ProviderEvents.done(choice?.finish_reason || 'stop', ProviderUtils.normalizeUsage(data.usage));
      }
    } catch (err) {
      const { ProviderError } = require('../providerErrors');
      throw new ProviderError(err.message, err.status || 502);
    }
  }

  async checkHealth(config = {}) {
    try {
      const response = await fetch(this.resolveHealthUrl(config), {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (_err) {
      return false;
    }
  }

  async getModels(config = {}) {
    try {
      const response = await fetch(`${this.normalizeBaseUrl(config.endpoint_url)}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return this.models;
      const data = await response.json();
      const remote = (data.data || []).map((item) => item.id).filter(Boolean);
      return remote.length > 0 ? remote : this.models;
    } catch (_err) {
      return this.models;
    }
  }
}

module.exports = new LlamaCppProvider();
module.exports.LlamaCppProvider = LlamaCppProvider;
