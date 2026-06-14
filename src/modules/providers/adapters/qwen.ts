import BaseProvider from '../base.provider';
import ProviderEvents from '../providerEvents';
import { ProviderError } from '../providerErrors';
import { ProviderUtils } from './provider_utils';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';
import logger from '../../../core/logger';
import costCalculator from '../../cost/cost_calculator.service';
const qwenLogger = logger.scoped('QwenAdapter');

type QwenConfig = Record<string, unknown> & {
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
};

type QwenOptions = Record<string, unknown> & {
  stream?: boolean;
};

type QwenStreamEvent = {
  usage?: unknown;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: unknown;
    };
  }>;
};

type QwenResponse = {
  usage?: unknown;
  choices: Array<{
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

class QwenProvider extends BaseProvider {
  defaultBaseUrl: string;

  constructor(config: QwenConfig = {}) {
    super({
      id: config.id || 'qwen',
      name: config.name || 'Qwen',
      models: config.models || ['qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash'],
      defaultModel: config.defaultModel || 'qwen3.7-max',
      capabilities: Object.assign(
        { stream: true, tools: true, retrieval: true },
        config.capabilities
      ),
    });
    this.defaultBaseUrl = config.defaultBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  async *handleChat(messages: ChatMessage[], config: QwenConfig, options: QwenOptions = {}): AsyncIterable<StreamEvent> {

    const targetModel = String(config.model_name || config.defaultModel || this.defaultModel);
    const params: Record<string, unknown> = {
      model: targetModel,
      messages,
      stream: !!options.stream,
    };

    if (config.extra_params) Object.assign(params, config.extra_params);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    };
    const url = `${config.endpoint_url || this.defaultBaseUrl}/chat/completions`;

    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(params) });
      if (!response.ok) throw new Error(`Qwen API Error: ${response.statusText}`);

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
                const data = JSON.parse(line.slice(6)) as QwenStreamEvent;
                if (data.usage) finalUsage = data.usage;
                const choice = data.choices?.[0];
                if (!choice) continue;
                if (choice.delta?.content) yield ProviderEvents.delta(choice.delta.content);
                if (choice.delta?.tool_calls) yield ProviderEvents.toolCall(choice.delta.tool_calls);
              } catch (e) {
                qwenLogger.warn('SSE JSON parse error', { error: e instanceof Error ? e.message : String(e) });
              }
            }
          }
        }
        yield ProviderEvents.done(
          'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(finalUsage), {
            providerId: this.id,
            modelName: targetModel,
            config
          })
        );
      } else {
        const data = await response.json() as QwenResponse;
        const choice = data.choices[0];
        if (choice.message?.content) yield ProviderEvents.delta(choice.message.content);
        if (choice.message?.tool_calls) yield ProviderEvents.toolCall(choice.message.tool_calls);
        yield ProviderEvents.done(
          choice.finish_reason || 'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(data.usage), {
            providerId: this.id,
            modelName: targetModel,
            config
          })
        );
      }
    } catch (err: unknown) {
      const source = err instanceof Error ? err as ProviderErrorSource : new Error(String(err)) as ProviderErrorSource;
      throw new ProviderError(source.message, source.status || 502);
    }
  }

  async checkHealth(_config: QwenConfig = {}): Promise<boolean> {
    return true;
  }
}

const instance = new QwenProvider();
export = instance;
