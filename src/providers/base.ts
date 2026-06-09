import { ChatMessage } from '../types/chat.js';

type ModelUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type ChatCompletionDelta = {
  content?: string;
  tool_calls?: unknown;
};

type ChatCompletionMessage = {
  role: 'assistant';
  content: string;
  tool_calls?: unknown;
};

export type ProviderConfig = {
  id: string;
  name: string;
  models?: string[];
  defaultModel?: string;
  capabilities?: {
    stream?: boolean;
    tools?: boolean;
  };
};

export type ChatEvent = 
  | { type: 'delta'; text: string }
  | { type: 'done'; finishReason: string; usage?: ModelUsage | Record<string, unknown> }
  | { type: 'error'; message: string; code?: string };

export abstract class BaseProvider {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  capabilities: {
    stream: boolean;
    tools: boolean;
  };

  constructor(config: ProviderConfig) {
    if (!config.id || !config.name) {
      throw new Error('Provider must have an id and name');
    }
    this.id = config.id;
    this.name = config.name;
    this.models = config.models || [];
    this.defaultModel = config.defaultModel || '';
    this.capabilities = {
      stream: true,
      tools: false,
      ...config.capabilities
    };
  }

  abstract handleChat(
    messages: ChatMessage[],
    config: Record<string, unknown>,
    options: Record<string, unknown>
  ): AsyncIterable<ChatEvent>;

  async checkHealth(_config: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  protected buildChunk(model: string, text: string, finishReason: string | null = null, toolCalls: unknown = null) {
    const delta: ChatCompletionDelta = {};
    if (finishReason) {
      // No delta content
    } else if (toolCalls) {
      delta.tool_calls = toolCalls;
    } else {
      delta.content = text;
    }

    return {
      id: `chatcmpl-${this.id}-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model || this.defaultModel,
      choices: [{
        index: 0,
        delta,
        finish_reason: finishReason,
      }],
    };
  }

  protected buildResponse(model: string, text: string, usage: ModelUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, toolCalls: unknown = null) {
    const message: ChatCompletionMessage = { role: 'assistant', content: text };
    if (toolCalls) message.tool_calls = toolCalls;

    return {
      id: `chatcmpl-${this.id}-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || this.defaultModel,
      choices: [{
        index: 0,
        message,
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
      }],
      usage,
    };
  }
}
