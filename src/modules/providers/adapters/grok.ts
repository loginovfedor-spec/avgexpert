import BaseProvider from '../base.provider';
import ProviderEvents from '../providerEvents';
import { ProviderError } from '../providerErrors';
import { ProviderUtils } from './provider_utils';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';
import logger from '../../../core/logger';
import costCalculator from '../../cost/cost_calculator.service';
const grokLogger = logger.scoped('GrokAdapter');

type GrokConfig = Record<string, unknown> & {
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

type GrokOptions = Record<string, unknown> & {
  stream?: boolean;
};

type GrokStreamEvent = {
  usage?: unknown;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: unknown;
    };
  }>;
};

type GrokResponse = {
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

class GrokProvider extends BaseProvider {
  defaultBaseUrl: string;

  constructor(config: GrokConfig = {}) {
    super({
      id: config.id || 'grok',
      name: config.name || 'Grok',
      models: config.models || ['grok-4.3', 'grok-4.20-reasoning', 'grok-4.20-non-reasoning'],
      defaultModel: config.defaultModel || 'grok-4.3',
      capabilities: Object.assign(
        { stream: true, tools: true },
        config.capabilities
      ),
    });
    this.defaultBaseUrl = config.defaultBaseUrl || 'https://api.x.ai/v1';
  }

  async *handleChat(messages: ChatMessage[], config: GrokConfig, options: GrokOptions = {}): AsyncIterable<StreamEvent> {

    const params: Record<string, unknown> = {
      model: config.model_name || config.defaultModel || this.defaultModel,
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
      if (!response.ok) throw new Error(`Grok API Error: ${response.statusText}`);

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
                const data = JSON.parse(line.slice(6)) as GrokStreamEvent;
                if (data.usage) finalUsage = data.usage;
                const choice = data.choices?.[0];
                if (!choice) continue;
                if (choice.delta?.content) yield ProviderEvents.delta(choice.delta.content);
                if (choice.delta?.tool_calls) yield ProviderEvents.toolCall(choice.delta.tool_calls);
              } catch (e) {
                grokLogger.warn('SSE JSON parse error', { error: e instanceof Error ? e.message : String(e) });
              }
            }
          }
        }
        yield ProviderEvents.done(
          'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(finalUsage), {
            providerId: this.id,
            modelName: String(params.model),
            config
          })
        );
      } else {
        const data = await response.json() as GrokResponse;
        const choice = data.choices[0];
        if (choice.message?.content) yield ProviderEvents.delta(choice.message.content);
        if (choice.message?.tool_calls) yield ProviderEvents.toolCall(choice.message.tool_calls);
        yield ProviderEvents.done(
          choice.finish_reason || 'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(data.usage), {
            providerId: this.id,
            modelName: String(params.model),
            config
          })
        );
      }
    } catch (err: unknown) {
      const source = err instanceof Error ? err as ProviderErrorSource : new Error(String(err)) as ProviderErrorSource;
      throw new ProviderError(source.message, source.status || 502);
    }
  }

  async checkHealth(_config: GrokConfig = {}): Promise<boolean> {
    return true;
  }
}

const instance = new GrokProvider();
export = instance;
