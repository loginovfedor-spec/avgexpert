import OpenAI from 'openai';
import BaseProvider from '../base.provider';
import ProviderEvents from '../providerEvents';
import { ProviderError } from '../providerErrors';
import { ProviderUtils } from './provider_utils';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';
import costCalculator from '../../cost/cost_calculator.service';

type OpenAIAdapterConfig = Record<string, unknown> & {
  id?: string;
  name?: string;
  models?: string[];
  defaultModel?: string;
  defaultBaseUrl?: string;
  capabilities?: Record<string, unknown>;
  api_key?: string;
  endpoint_url?: string;
  model_name?: string;
  DEFAULT_MODEL?: string;
  extra_params?: Record<string, unknown>;
  parallel_tool_calls?: unknown;
  reasoning?: unknown;
  store?: unknown;
  text?: unknown;
  tool_choice?: unknown;
  tools?: unknown;
  truncation?: unknown;
  metadata?: unknown;
  safety_identifier?: unknown;
  prompt_cache_key?: unknown;
  prompt_cache_retention?: unknown;
  background?: unknown;
  context_management?: unknown;
  service_tier?: unknown;
  prompt?: unknown;
  previous_response_id?: unknown;
  conversation?: unknown;
  max_tool_calls?: unknown;
};

type OpenAIAdapterOptions = Record<string, unknown> & {
  stream?: boolean;
  max_tokens?: number;
  tools?: unknown;
};

type ResponseInputItem = {
  role: 'user' | 'assistant';
  content: Array<{ type: 'input_text' | 'output_text'; text: string }>;
};

type ResponsesClient = {
  responses: {
    create(params: Record<string, unknown>): Promise<unknown>;
  };
  models: {
    list(): Promise<unknown>;
  };
};

type ResponseStreamEvent = {
  type?: string;
  delta?: string;
  index?: number;
  tool_call?: unknown;
  response?: {
    finish_reason?: string;
    usage?: unknown;
  };
};

type ResponseOutputItem = {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type ResponseData = {
  output?: ResponseOutputItem[];
  usage?: unknown;
  finish_reason?: string;
};

type ProviderErrorSource = Error & {
  status?: number;
};

const OpenAIConstructor = OpenAI as unknown as new (config: Record<string, unknown>) => ResponsesClient;

class OpenAIGPT55Provider extends BaseProvider {
  defaultBaseUrl: string;

  constructor(config: OpenAIAdapterConfig = {}) {
    super({
      id: config.id || 'openai_gpt5_5',
      name: config.name || 'OpenAI GPT-5.5',
      models: config.models || ['gpt-5.5', 'o1', 'o3-mini'],
      defaultModel: config.defaultModel || 'gpt-5.5',
      capabilities: Object.assign(
        { stream: true, tools: true, retrieval: true },
        config.capabilities
      ),
    });
    this.defaultBaseUrl = config.defaultBaseUrl || 'https://api.openai.com/v1';
  }

  private _convertMessages(messages: ChatMessage[]) {
    let instructions = '';
    const input: ResponseInputItem[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        instructions += (instructions ? '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        input.push({
          role: 'user',
          content: [{ type: 'input_text', text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        input.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content }],
        });
      }
    }
    return { instructions, input };
  }

  async *handleChat(messages: ChatMessage[], config: OpenAIAdapterConfig, options: OpenAIAdapterOptions = {}): AsyncIterable<StreamEvent> {
    const client = new OpenAIConstructor({
      apiKey: config.api_key,
      baseURL: config.endpoint_url || this.defaultBaseUrl,
    });

    const { instructions, input } = this._convertMessages(messages);

    let targetModel = config.model_name || config.DEFAULT_MODEL || config.defaultModel || this.defaultModel;
    if (targetModel === 'default') {
      targetModel = config.DEFAULT_MODEL || config.defaultModel || this.defaultModel || 'gpt-5.5';
    }

    const params: Record<string, unknown> = {
      model: targetModel,
      input,
      stream: !!options.stream,
    };

    if (instructions) params.instructions = instructions;

    if (config.parallel_tool_calls !== undefined) params.parallel_tool_calls = config.parallel_tool_calls;
    if (config.reasoning !== undefined) params.reasoning = config.reasoning;
    if (config.store !== undefined) params.store = config.store;
    if (config.text !== undefined) params.text = config.text;
    if (config.tool_choice !== undefined) params.tool_choice = config.tool_choice;
    if (config.tools !== undefined || options.tools !== undefined) params.tools = config.tools || options.tools;
    if (config.truncation !== undefined) params.truncation = config.truncation;
    if (config.metadata !== undefined) params.metadata = config.metadata;

    if (config.safety_identifier !== undefined) params.safety_identifier = config.safety_identifier;
    if (config.prompt_cache_key !== undefined) params.prompt_cache_key = config.prompt_cache_key;
    if (config.prompt_cache_retention !== undefined) params.prompt_cache_retention = config.prompt_cache_retention;
    if (config.background !== undefined) params.background = config.background;
    if (config.context_management !== undefined) params.context_management = config.context_management;
    if (config.service_tier !== undefined) params.service_tier = config.service_tier;
    if (config.prompt !== undefined) params.prompt = config.prompt;
    if (config.previous_response_id !== undefined) params.previous_response_id = config.previous_response_id;
    if (config.conversation !== undefined) params.conversation = config.conversation;
    if (config.max_tool_calls !== undefined) params.max_tool_calls = config.max_tool_calls;

    if (config.extra_params && typeof config.extra_params === 'object') {
      Object.assign(params, config.extra_params);
    }

    ProviderUtils.cleanUnsupportedParams(params, [
      'temperature', 'top_p', 'top_k', 'min_p', 'repeat_penalty', 'max_tokens',
      'user', 'include', 'messages', 'vector_store_ids', 'web_search_enabled', 'image_upload_enabled', 'vision_enabled',
    ]);

    try {
      if (params.stream) {
        const stream = await client.responses.create(params) as AsyncIterable<ResponseStreamEvent>;
        let finalUsage: unknown = null;
        let lastFinishReason = 'stop';

        for await (const event of stream) {
          if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning.delta') {
            const reasoning = event.delta;
            if (typeof ProviderEvents.reasoningDelta === 'function') {
              yield ProviderEvents.reasoningDelta(reasoning ?? '');
            } else {
              yield ProviderEvents.delta(`<think>${reasoning}</think>`);
            }
          } else if (event.type === 'response.output_text.delta') {
            yield ProviderEvents.delta(event.delta ?? '');
          } else if (event.type === 'response.tool_call.created' || event.type === 'response.tool_call.delta' || event.type === 'response.tool_call.output') {
            if (event.tool_call) {
              yield ProviderEvents.toolCall([event.tool_call]);
            } else if (event.delta && event.index !== undefined) {
              yield ProviderEvents.toolCall([{ index: event.index, type: 'function', function: { arguments: event.delta } }]);
            }
          } else if (event.type === 'response.completed') {
            lastFinishReason = event.response?.finish_reason || 'stop';
            if (event.response?.usage) {
              finalUsage = event.response.usage;
            }
          }
        }
        yield ProviderEvents.done(
          lastFinishReason,
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(finalUsage), {
            providerId: this.id,
            modelName: targetModel,
            config
          })
        );
      } else {
        const response = await client.responses.create(params) as ResponseData;
        let text = '';
        const toolCalls: unknown[] = [];

        if (response.output) {
          for (const item of response.output) {
            if (item.type === 'message' && item.content) {
              for (const part of item.content) {
                if (part.type === 'output_text') text += part.text;
                if (part.type === 'reasoning_text' || part.type === 'reasoning_summary_text') {
                  if (typeof ProviderEvents.reasoningDelta === 'function') {
                    yield ProviderEvents.reasoningDelta(part.text ?? '');
                  } else {
                    yield ProviderEvents.delta(`<think>${part.text}</think>\n\n`);
                  }
                }
              }
            } else if (item.type === 'tool_call') {
              toolCalls.push(item);
            }
          }
        }

        if (text) {
          yield ProviderEvents.delta(text);
        }

        if (toolCalls.length > 0) {
          yield ProviderEvents.toolCall(toolCalls);
        }

        const usage = response.usage || null;
        yield ProviderEvents.done(
          response.finish_reason || 'stop',
          costCalculator.enrichUsage(ProviderUtils.normalizeUsage(usage), {
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

  async checkHealth(config: OpenAIAdapterConfig = {}): Promise<boolean> {
    const client = new OpenAIConstructor({
      apiKey: config.api_key || 'dummy',
      baseURL: config.endpoint_url || this.defaultBaseUrl,
      timeout: 2000,
      maxRetries: 0,
    });
    try {
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    return this.models;
  }
}

export = new OpenAIGPT55Provider();
