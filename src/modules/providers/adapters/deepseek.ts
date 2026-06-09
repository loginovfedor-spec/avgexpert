import BaseProvider = require('../base.provider');
import { ProviderUtils } from './provider_utils';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';
import logger = require('../../../core/logger');

const deepseekLogger = logger.scoped('DeepSeekAdapter');

type DeepSeekConfig = Record<string, unknown> & {
  id?: string;
  name?: string;
  models?: string[];
  defaultModel?: string;
  defaultBaseUrl?: string;
  capabilities?: Record<string, unknown>;
  model_name?: string;
  api_key?: string;
  endpoint_url?: string;
  temperature?: number;
  extra_params?: Record<string, unknown>;
};

type DeepSeekOptions = Record<string, unknown> & {
  stream?: boolean;
  max_tokens?: number;
};

type DeepSeekStreamEvent = {
  usage?: unknown;
  choices?: Array<{
    delta?: {
      reasoning_content?: string;
      content?: string;
      tool_calls?: unknown;
    };
  }>;
};

type DeepSeekResponse = {
  usage?: unknown;
  choices: Array<{
    finish_reason?: string;
    message?: {
      reasoning_content?: string;
      content?: string;
      tool_calls?: unknown;
    };
  }>;
};

type ProviderErrorSource = Error & {
  status?: number;
};

class DeepSeekProvider extends BaseProvider {
  defaultBaseUrl: string;

  constructor(config: DeepSeekConfig = {}) {
    super({
      id: config.id || 'deepseek',
      name: config.name || 'DeepSeek',
      models: config.models || ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: config.defaultModel || 'deepseek-chat',
      capabilities: Object.assign(
        { stream: true, tools: true, retrieval: true },
        config.capabilities
      ),
    });
    this.defaultBaseUrl = config.defaultBaseUrl || 'https://api.deepseek.com/v1';
  }

  async *handleChat(messages: ChatMessage[], config: DeepSeekConfig, options: DeepSeekOptions = {}): AsyncIterable<StreamEvent> {
    const ProviderEvents = require('../providerEvents');
    
    const params: Record<string, unknown> = {
      model: config.model_name || config.defaultModel || this.defaultModel,
      messages: messages,
      stream: !!options.stream,
    };

    if (options.max_tokens) params.max_tokens = options.max_tokens;
    if (config.temperature !== undefined) params.temperature = config.temperature;
    
    if (config.extra_params && typeof config.extra_params === 'object') {
      Object.assign(params, config.extra_params);
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key}`
    };
    const url = `${config.endpoint_url || this.defaultBaseUrl}/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API Error: ${response.statusText}`);
      }

      if (params.stream) {
         if (!response.body) throw new Error("No response body");
         const reader = response.body.getReader();
         const decoder = new TextDecoder("utf-8");
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
                   const data = JSON.parse(line.slice(6)) as DeepSeekStreamEvent;
                   if (data.usage) finalUsage = data.usage;
                   const choice = data.choices?.[0];
                   if (!choice) continue;

                   if (choice.delta?.reasoning_content) {
                      if (typeof ProviderEvents.reasoningDelta === 'function') {
                          yield ProviderEvents.reasoningDelta(choice.delta.reasoning_content);
                      } else {
                          yield ProviderEvents.delta(`<think>${choice.delta.reasoning_content}</think>`);
                      }
                   }
                   if (choice.delta?.content) {
                      yield ProviderEvents.delta(choice.delta.content);
                   }
                   if (choice.delta?.tool_calls) {
                      yield ProviderEvents.toolCall(choice.delta.tool_calls);
                   }
                 } catch (e) {
                   deepseekLogger.error('Stream parse error', e);
                 }
               }
            }
         }
         yield ProviderEvents.done('stop', ProviderUtils.normalizeUsage(finalUsage)); 
      } else {
         const data = await response.json() as DeepSeekResponse;
         const choice = data.choices[0];
         const reasoning = choice.message?.reasoning_content;
         if (reasoning) {
             if (typeof ProviderEvents.reasoningDelta === 'function') {
                 yield ProviderEvents.reasoningDelta(reasoning);
             } else {
                 yield ProviderEvents.delta(`<think>${reasoning}</think>\n\n`);
             }
         }
         if (choice.message?.content) {
            yield ProviderEvents.delta(choice.message.content);
         }
         if (choice.message?.tool_calls) {
            yield ProviderEvents.toolCall(choice.message.tool_calls);
         }
         yield ProviderEvents.done(choice.finish_reason || 'stop', ProviderUtils.normalizeUsage(data.usage));
      }
    } catch (err: unknown) {
      const { ProviderError } = require('../providerErrors');
      const source = err instanceof Error ? err as ProviderErrorSource : new Error(String(err)) as ProviderErrorSource;
      throw new ProviderError(source.message, source.status || 502);
    }
  }

  async checkHealth(config: DeepSeekConfig = {}): Promise<boolean> {
    try {
      const url = `${config.endpoint_url || this.defaultBaseUrl}/models`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${config.api_key || ''}` } });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    return this.models;
  }
}

export = new DeepSeekProvider();
