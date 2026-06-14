import * as limits from './limit.service';
import { sanitizePromptText } from '../../core/utils';
import { ALLOWED_EXTRA_PARAMS } from '../../core/config';
import { stripNativeRag } from '../rag/rag.orchestrator';
import type { ChatMessage, ModelUsage } from '../../types/chat.types';

const ADEQUACY_COVENANT = `
### ADEQUACY COVENANT
1. Do not exceed domain boundaries (Medical/Legal/Financial/Psychological).
2. Do not mix logical levels (Fact vs Value).
3. Do not assume hidden authority over the user's inner state.
4. If retrieval fails or is low-quality, explicitly state your limitations.
`;

type MapperUser = Record<string, unknown> & {
  is_admin?: boolean;
};

type CategorySettings = Record<string, unknown> & {
  system_prompt?: string;
  extra_params?: Record<string, unknown>;
};

type ProviderCfg = Record<string, unknown>;

type CompletionBody = Record<string, unknown> & {
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repeat_penalty?: number;
  n_predict?: number;
  extra_params?: Record<string, unknown>;
};

type MapOptionsResult = {
  options: {
    stream: boolean;
    max_tokens: number;
  };
  mergedSettings: CategorySettings;
};

class ChatCompletionMapper {
  prepareMessages({
    messages,
    user,
    categorySettings,
  }: {
    messages: ChatMessage[];
    user: MapperUser;
    categorySettings: CategorySettings;
  }): { messages: ChatMessage[]; injectionDetected: boolean } {
    let injectionDetected = false;
    let processedMessages = messages.map((m) => {
      if (m.role === 'user' && typeof m.content === 'string') {
        const sanitized = sanitizePromptText(m.content);
        if (sanitized !== m.content) injectionDetected = true;
        return { ...m, content: sanitized };
      }
      return m;
    });

    if (!user.is_admin) {
      processedMessages = processedMessages.filter((m) => m.role !== 'system');
    }

    processedMessages = processedMessages.filter((m) =>
      (m.content && m.content.trim().length > 0) ||
      (m.tool_calls && m.tool_calls.length > 0) ||
      m.role === 'assistant'
    );

    const hasSystem = processedMessages.some((m) => m.role === 'system');
    if (hasSystem) {
      processedMessages = processedMessages.map((m) =>
        m.role === 'system' ? { ...m, content: m.content + ADEQUACY_COVENANT } : m
      );
    } else {
      processedMessages = [{ role: 'system', content: ADEQUACY_COVENANT }, ...processedMessages];
    }

    if (categorySettings.system_prompt?.trim()) {
      if (processedMessages[0].role === 'system') {
        processedMessages[0].content = `${categorySettings.system_prompt}\n\n${processedMessages[0].content}`;
      } else {
        processedMessages = [{ role: 'system', content: categorySettings.system_prompt }, ...processedMessages];
      }
    }

    return { messages: processedMessages, injectionDetected };
  }

  mapOptions(
    body: CompletionBody,
    categorySettings: CategorySettings,
    user: MapperUser,
    providerCfg: ProviderCfg = {}
  ): MapOptionsResult {
    const options = {
      stream: !!body.stream,
      max_tokens: limits.getOutputLimit(user, categorySettings, providerCfg),
    };

    const mergedSettings: CategorySettings = {
      ...categorySettings,
      extra_params: stripNativeRag({ ...(categorySettings.extra_params || {}) }),
    };

    if (body.temperature !== undefined) mergedSettings.temperature = body.temperature;
    if (body.top_p !== undefined) mergedSettings.top_p = body.top_p;
    if (body.top_k !== undefined) mergedSettings.top_k = body.top_k;
    if (body.min_p !== undefined) mergedSettings.min_p = body.min_p;
    if (body.repeat_penalty !== undefined) mergedSettings.repeat_penalty = body.repeat_penalty;
    if (body.n_predict !== undefined) mergedSettings.n_predict = body.n_predict;

    if (body.extra_params) {
      const allowedKeys = user.is_admin ? ALLOWED_EXTRA_PARAMS.ADMIN : ALLOWED_EXTRA_PARAMS.USER;
      const safeParams = this._pickAllowedExtraParams(body.extra_params, allowedKeys);
      mergedSettings.extra_params = { ...mergedSettings.extra_params, ...safeParams };
    }

    return { options, mergedSettings };
  }

  buildChunk(
    model: string | null,
    text: string | null | undefined,
    finishReason: string | null = null,
    toolCall: unknown = null
  ) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model || 'default',
      choices: [{
        index: 0,
        delta: toolCall ? { tool_calls: [toolCall] } : (text !== null && text !== undefined ? { content: text } : {}),
        finish_reason: finishReason,
      }],
    };
  }

  buildResponse(model: string | null, text: string, usage: ModelUsage) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'default',
      choices: [{
        index: 0,
        message: { role: 'assistant' as const, content: text },
        finish_reason: 'stop',
      }],
      usage,
    };
  }

  _pickAllowedExtraParams(input: Record<string, unknown>, allowed: readonly string[]) {
    const out: Record<string, unknown> = {};
    if (!input || typeof input !== 'object') return out;
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        out[key] = input[key];
      }
    }
    return out;
  }
}

export = new ChatCompletionMapper();
