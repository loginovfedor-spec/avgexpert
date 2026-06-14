import { ModelUsage } from '../../../types/chat.types';

type ProviderResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: Array<{
      type?: unknown;
      text?: unknown;
    }>;
  }>;
};

type UsageLike = {
  input_tokens?: number;
  prompt_tokens?: number;
  output_tokens?: number;
  completion_tokens?: number;
  cached_input_tokens?: number;
  cachedContentTokenCount?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  prompt_cache_hit_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  reasoning_tokens?: number;
  total_tokens?: number;
};

export class ProviderUtils {
  static extractTextFromResponse(response: unknown): string {
    if (!response) return '';
    const data = response as ProviderResponse;
    
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && typeof choice.message.content === 'string') {
        return choice.message.content;
      }
    }

    if (typeof data.output_text === 'string') return data.output_text;
    
    if (Array.isArray(data.output)) {
      let text = '';
      for (const item of data.output) {
        if (item.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            text += String(part.text);
          }
        }
      }
      return text;
    }

    return '';
  }

  static normalizeUsage(usage: unknown): ModelUsage {
    if (!usage) {
      return { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
    }
    const data = usage as UsageLike;
    
    const promptTokens = data.input_tokens || data.prompt_tokens || 0;
    const completionTokens = data.output_tokens || data.completion_tokens || 0;
    
    let reasoningTokens = 0;
    if (data.completion_tokens_details && typeof data.completion_tokens_details.reasoning_tokens === 'number') {
      reasoningTokens = data.completion_tokens_details.reasoning_tokens;
    } else if (typeof data.reasoning_tokens === 'number') {
      reasoningTokens = data.reasoning_tokens;
    }

    let cachedInputTokens = 0;
    if (typeof data.cached_input_tokens === 'number') {
      cachedInputTokens = data.cached_input_tokens;
    } else if (typeof data.cachedContentTokenCount === 'number') {
      cachedInputTokens = data.cachedContentTokenCount;
    } else if (typeof data.prompt_tokens_details?.cached_tokens === 'number') {
      cachedInputTokens = data.prompt_tokens_details.cached_tokens;
    } else if (typeof data.prompt_cache_hit_tokens === 'number') {
      cachedInputTokens = data.prompt_cache_hit_tokens;
    }

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      reasoning_tokens: reasoningTokens,
      total_tokens: data.total_tokens || (promptTokens + completionTokens),
      ...(cachedInputTokens > 0 ? { cached_input_tokens: cachedInputTokens } : {}),
    };
  }

  static cleanUnsupportedParams(params: Record<string, unknown>, forbiddenKeys: string[] = []) {
    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        delete params[key];
      }
    }
  }
}
