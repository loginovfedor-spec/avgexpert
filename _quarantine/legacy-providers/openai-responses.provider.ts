import OpenAI from 'openai';
import { BaseProvider, ProviderConfig, ChatEvent } from './base.js';
import { ChatMessage } from '../../src/types/chat.js';

type ResponseInputItem = {
  role: 'user' | 'assistant';
  content: Array<{ type: 'input_text' | 'output_text'; text: string }>;
};

type ResponsesConfig = Record<string, unknown> & {
  api_key?: string;
  endpoint_url?: string;
  model_name?: string;
  temperature?: number;
  top_p?: number;
  extra_params?: Record<string, unknown>;
};

type ResponsesOptions = Record<string, unknown> & {
  stream?: boolean;
  max_tokens?: number;
};

type ResponsesClient = OpenAI & {
  responses: {
    create(params: Record<string, unknown>): Promise<unknown>;
  };
};

type ResponseStreamEvent = {
  type?: string;
  delta?: string;
  tool_call?: {
    name?: string;
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
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type ProviderErrorSource = Error & {
  status?: number;
};

export class OpenAIResponsesProvider extends BaseProvider {
  private defaultBaseUrl?: string;

  constructor(config: ProviderConfig & { defaultBaseUrl?: string }) {
    super({
      ...config,
      capabilities: {
        stream: true,
        tools: true,
        ...config.capabilities
      }
    });
    this.defaultBaseUrl = config.defaultBaseUrl;
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

  async *handleChat(
    messages: ChatMessage[],
    config: ResponsesConfig,
    options: ResponsesOptions
  ): AsyncIterable<ChatEvent> {
    const client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.endpoint_url || this.defaultBaseUrl,
    }) as ResponsesClient;

    const { instructions, input } = this._convertMessages(messages);

    const params: Record<string, unknown> = {
      model: config.model_name || this.defaultModel,
      input,
      stream: !!options.stream,
    };

    if (instructions) params.instructions = instructions;
    if (options.max_tokens) params.max_output_tokens = options.max_tokens;
    if (config.temperature !== undefined) params.temperature = config.temperature;
    if (config.top_p !== undefined) params.top_p = config.top_p;

    if (config.extra_params && typeof config.extra_params === 'object') {
      Object.assign(params, config.extra_params);
    }

    try {
      if (params.stream) {
        const stream = await client.responses.create(params) as AsyncIterable<ResponseStreamEvent>;
        
        let inReasoning = false;
        for await (const event of stream) {
          if (event.type === 'response.reasoning_summary_text.delta') {
            let text = event.delta || '';
            if (!inReasoning) {
              text = '<think>\n' + text;
              inReasoning = true;
            }
            yield { type: 'delta', text };
          } else if (event.type === 'response.output_text.delta') {
            let text = event.delta || '';
            if (inReasoning) {
              text = '\n</think>\n\n' + text;
              inReasoning = false;
            }
            yield { type: 'delta', text };
          } else if (event.type === 'response.tool_call.created') {
            const toolName = event.tool_call?.name || 'unknown';
            yield { type: 'delta', text: `\n<tool name="${toolName}">\n` };
          } else if (event.type === 'response.tool_call.output') {
            yield { type: 'delta', text: `\n</tool>\n\n` };
          }
        }
        yield { type: 'done', finishReason: 'stop' };
      } else {
        const response = await client.responses.create(params) as ResponseData;

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

        const usage = response.usage ? {
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        if (text) {
          yield { type: 'delta', text };
        }
        yield { type: 'done', finishReason: 'stop', usage };
      }
    } catch (err: unknown) {
      const source = err instanceof Error ? err as ProviderErrorSource : new Error(String(err)) as ProviderErrorSource;
      yield { type: 'error', message: source.message, code: source.status?.toString() };
    }
  }
}
