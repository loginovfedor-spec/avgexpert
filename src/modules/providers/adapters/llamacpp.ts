import BaseProvider from '../base.provider';
import ProviderEvents from '../providerEvents';
import { ProviderError } from '../providerErrors';
import { ProviderUtils } from './provider_utils';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';
import costCalculator from '../../cost/cost_calculator.service';

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

function stripProviderExtraParams(extraParams: Record<string, unknown> = {}) {
  const cleaned = { ...extraParams };
  for (const key of PROVIDER_STRIP_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

type LlamaCppConfig = Record<string, unknown> & {
  id?: string;
  name?: string;
  models?: string[];
  defaultModel?: string;
  defaultBaseUrl?: string;
  capabilities?: Record<string, unknown>;
  model_name?: string;
  api_key?: string;
  endpoint_url?: string;
  extra_params?: Record<string, unknown>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repeat_penalty?: number;
  n_predict?: number;
  _messages?: ChatMessage[];
};

type LlamaCppOptions = Record<string, unknown> & {
  stream?: boolean;
  max_tokens?: number;
  signal?: AbortSignal;
};

type LlamaCppStreamEvent = {
  usage?: unknown;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: unknown;
    };
    finish_reason?: string;
    message?: {
      content?: string;
      tool_calls?: unknown;
    };
  }>;
};

type ProviderErrorSource = Error & {
  status?: number;
};

class LlamaCppProvider extends BaseProvider {
  defaultBaseUrl: string;

  constructor(config: LlamaCppConfig = {}) {
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

  normalizeBaseUrl(endpointUrl?: string): string {
    const raw = String(endpointUrl || this.defaultBaseUrl).trim().replace(/\/+$/, '');
    if (raw.endsWith('/v1')) return raw;
    return `${raw}/v1`;
  }

  resolveHealthUrl(config: LlamaCppConfig = {}): string {
    const base = String(config.endpoint_url || this.defaultBaseUrl).trim().replace(/\/+$/, '');
    if (base.endsWith('/v1')) {
      return base.replace(/\/v1$/, '/health');
    }
    return `${base}/health`;
  }

  buildCompletionParams(config: LlamaCppConfig = {}, options: LlamaCppOptions = {}) {
    const params: Record<string, unknown> = {
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

  async *handleChat(messages: ChatMessage[], config: LlamaCppConfig, options: LlamaCppOptions = {}): AsyncIterable<StreamEvent> {
    const params = this.buildCompletionParams(
      { ...config, _messages: messages },
      options
    );

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;

    const url = `${this.normalizeBaseUrl(config.endpoint_url)}/chat/completions`;

    const startTime = Date.now();
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
        if (!response.body) throw new Error('No response body');
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let finalUsage: unknown = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          const lastLine = lines.pop();
          buffer = lastLine !== undefined ? lastLine : '';

          for (let line of lines) {
            line = line.trim();
            if (!line || line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as LlamaCppStreamEvent;
                if (data.usage) finalUsage = data.usage;
                const choice = data.choices?.[0];
                if (!choice) continue;
                if (choice.delta?.content) yield ProviderEvents.delta(choice.delta.content);
                if (choice.delta?.tool_calls) yield ProviderEvents.toolCall(choice.delta.tool_calls);
              } catch {
                // ignore malformed SSE chunks
              }
            }
          }
        }
        const computeSeconds = (Date.now() - startTime) / 1000;
        yield ProviderEvents.done(
          'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(finalUsage), {
            providerId: this.id,
            modelName: String(params.model),
            config,
            computeSeconds
          })
        );
      } else {
        const data = await response.json() as LlamaCppStreamEvent;
        const choice = data.choices?.[0];
        if (choice?.message?.content) yield ProviderEvents.delta(choice.message.content);
        if (choice?.message?.tool_calls) yield ProviderEvents.toolCall(choice.message.tool_calls);
        const computeSeconds = (Date.now() - startTime) / 1000;
        yield ProviderEvents.done(
          choice?.finish_reason || 'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(data.usage), {
            providerId: this.id,
            modelName: String(params.model),
            config,
            computeSeconds
          })
        );
      }
    } catch (err: unknown) {
      const source = err instanceof Error ? err as ProviderErrorSource : new Error(String(err)) as ProviderErrorSource;
      throw new ProviderError(source.message, source.status || 502);
    }
  }

  async checkHealth(config: LlamaCppConfig = {}): Promise<boolean> {
    try {
      const response = await fetch(this.resolveHealthUrl(config), {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getModels(config: LlamaCppConfig = {}): Promise<string[]> {
    try {
      const response = await fetch(`${this.normalizeBaseUrl(config.endpoint_url)}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return this.models;
      const data = await response.json() as { data?: Array<{ id?: string }> };
      const remote = (data.data || []).map((item) => item.id).filter(Boolean) as string[];
      return remote.length > 0 ? remote : this.models;
    } catch {
      return this.models;
    }
  }
}

const instance = new LlamaCppProvider();
export = instance;
