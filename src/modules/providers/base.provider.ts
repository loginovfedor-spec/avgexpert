import { AdapterInterface, ProviderConfig, ProviderCapabilities, RequestOptions } from '../../types/provider.types';
import { ChatMessage, StreamEvent, ModelUsage } from '../../types/chat.types';

type ChatCompletionDelta = {
  content?: string;
  tool_calls?: unknown;
};

type ChatCompletionMessage = {
  role: 'assistant';
  content: string;
  tool_calls?: unknown;
};

type DebugConfig = {
  debug_mode?: boolean;
};

class BaseProvider implements AdapterInterface {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  capabilities: ProviderCapabilities;

  constructor(config: ProviderConfig) {
    if (!config.id || !config.name) {
      throw new Error('Provider must have an id and name');
    }
    this.id = config.id;
    this.name = config.name;
    this.models = config.models || [];
    this.defaultModel = config.defaultModel || '';
    this.capabilities = Object.assign({ stream: true, tools: false }, config.capabilities);
  }

  async *handleChat(_messages: ChatMessage[], _config: Record<string, unknown>, _options: RequestOptions): AsyncIterable<StreamEvent> {
    throw new Error(`handleChat() not implemented for provider: ${this.id}`);
  }

  buildChunk(model: string, text: string, finishReason: string | null = null, toolCalls: unknown = null) {
    const delta: ChatCompletionDelta = {};
    if (finishReason) {
      // No delta content/tools on final chunk
    } else if (toolCalls) {
      delta.tool_calls = toolCalls;
    } else {
      delta.content = text;
    }

    return {
      id: 'chatcmpl-' + this.id + '-' + Date.now(),
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

  buildResponse(model: string, text: string, usage: ModelUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, toolCalls: unknown = null) {
    const message: ChatCompletionMessage = { role: 'assistant', content: text };
    if (toolCalls) message.tool_calls = toolCalls;

    return {
      id: 'chatcmpl-' + this.id + '-' + Date.now(),
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

  async checkHealth(_config: Record<string, unknown>): Promise<boolean> {
    return true; 
  }

  async getModels(_config: Record<string, unknown>): Promise<string[]> {
    return this.models;
  }

  _pushDebugLog(config: DebugConfig | null | undefined, level: string, message: string) {
    if (!config || !config.debug_mode) return;
    try {
      const adminRouter = require('../admin/admin.routes');
      if (adminRouter && typeof adminRouter.pushDebugLog === 'function') {
        adminRouter.pushDebugLog({
          level,
          provider: this.id,
          message,
          ts: Date.now()
        });
      }
    } catch (_e) {
      // Fail silently
    }
  }
}

export = BaseProvider;
