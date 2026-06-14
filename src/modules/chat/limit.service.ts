import type { ChatMessage } from '../../types/chat.types';

export const TOKEN_LIMIT_STEP = 4096;
export const USER_INPUT_MIN = TOKEN_LIMIT_STEP;
export const USER_OUTPUT_MIN = TOKEN_LIMIT_STEP;
export const LOCAL_PROVIDER_DEFAULT_TIMEOUT_MS = 300000;
export const MAX_MESSAGE_CONTENT_CHARS = 1000000 * 4;

type ProviderCfg = Record<string, unknown> & {
  adapter?: string;
  provider_timeout_ms?: number | string;
  max_input_context_tokens?: number | string;
  max_output_generation_tokens?: number | string;
  _env?: Record<string, string>;
  extra_params?: Record<string, unknown>;
};

type CategorySettings = Record<string, unknown> & {
  input_context_max?: number | string;
  input_context_default?: number | string;
  max_tokens?: number | string;
};

type LimitUser = Record<string, unknown> & {
  input_context_limit?: number | string | null;
  output_generation_limit?: number | string | null;
};

type AdapterCaps = {
  input: number;
  output: number;
};

type LimitError = Error & {
  status: number;
  code: string;
  details: { estimated: number; limit: number };
};

function toPositiveInt(value: unknown, fallback: number | null = null): number | null {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clamp(value: unknown, min: number, max: number): number {
  const n = toPositiveInt(value, min) ?? min;
  return Math.min(Math.max(n, min), max);
}

function getProviderTimeout(providerCfg: ProviderCfg = {}, globalTimeoutMs = 60000): number {
  const env = providerCfg._env || {};
  const fromEnv = toPositiveInt(
    env.PROVIDER_TIMEOUT_MS ||
    env.LLAMACPP_PROVIDER_TIMEOUT ||
    providerCfg.provider_timeout_ms,
    null
  );
  if (fromEnv != null && fromEnv > 0) {
    return fromEnv;
  }
  if (['llamacpp', 'ollama'].includes(providerCfg.adapter || '')) {
    return Math.max(globalTimeoutMs, LOCAL_PROVIDER_DEFAULT_TIMEOUT_MS);
  }
  return globalTimeoutMs;
}

function getAdapterCaps(providerCfg: ProviderCfg = {}): AdapterCaps {
  const env = providerCfg._env || {};
  const extra = providerCfg.extra_params || {};
  const inputCap = toPositiveInt(
    env.MAX_INPUT_CONTEXT_TOKENS ||
    env.MAX_CONTEXT_TOKENS ||
    env.N_CTX ||
    providerCfg.max_input_context_tokens ||
    extra.max_input_context_tokens,
    Number.MAX_SAFE_INTEGER
  ) ?? Number.MAX_SAFE_INTEGER;
  const outputCap = toPositiveInt(
    env.MAX_OUTPUT_GENERATION_TOKENS ||
    env.MAX_OUTPUT_TOKENS ||
    providerCfg.max_output_generation_tokens ||
    extra.max_tokens,
    Number.MAX_SAFE_INTEGER
  ) ?? Number.MAX_SAFE_INTEGER;

  return {
    input: inputCap,
    output: outputCap,
  };
}

function getInputLimit(user: LimitUser = {}, categorySettings: CategorySettings = {}, providerCfg: ProviderCfg = {}): number {
  const caps = getAdapterCaps(providerCfg);
  const categoryMax = toPositiveInt(categorySettings.input_context_max, Number.MAX_SAFE_INTEGER) ?? Number.MAX_SAFE_INTEGER;
  const categoryDefault = toPositiveInt(categorySettings.input_context_default, categoryMax) ?? categoryMax;
  const requestedTokens = user.input_context_limit != null
    ? toPositiveInt(user.input_context_limit, categoryDefault)
    : categoryDefault;
  return clamp(requestedTokens, 0, Math.min(categoryMax, caps.input));
}

function getOutputLimit(user: LimitUser = {}, categorySettings: CategorySettings = {}, providerCfg: ProviderCfg = {}): number {
  const caps = getAdapterCaps(providerCfg);
  const categoryMax = toPositiveInt(categorySettings.max_tokens, Number.MAX_SAFE_INTEGER) ?? Number.MAX_SAFE_INTEGER;
  const requestedTokens = user.output_generation_limit != null
    ? toPositiveInt(user.output_generation_limit, categoryMax)
    : categoryMax;
  return clamp(requestedTokens, 0, Math.min(categoryMax, caps.output));
}

function estimateMessageTokens(messages: ChatMessage[] = []): number {
  const text = messages.map((m) => {
    if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return (m.content as Array<{ text?: string }>).map((part) => part?.text || '').join(' ');
    }
    return JSON.stringify(m.content || '');
  }).join('\n');
  return Math.ceil(text.length / 4);
}

function validateInputLimit(
  messages: ChatMessage[],
  user: LimitUser,
  categorySettings: CategorySettings,
  providerCfg: ProviderCfg
): { estimated: number; limit: number } {
  const limit = getInputLimit(user, categorySettings, providerCfg);
  const estimated = estimateMessageTokens(messages);
  if (estimated > limit) {
    const err = new Error(`Входной контекст превышает лимит: ${estimated} из ${limit} токенов.`) as LimitError;
    err.status = 400;
    err.code = 'input_context_limit_exceeded';
    err.details = { estimated, limit };
    throw err;
  }
  return { estimated, limit };
}

function validateUserLimits({
  userValues = {},
  categorySettings = {},
  providerCfg = {},
}: {
  userValues?: Record<string, unknown>;
  categorySettings?: CategorySettings;
  providerCfg?: ProviderCfg;
} = {}): { ok: boolean; errors: string[]; inputMax: number; outputMax: number } {
  const errors: string[] = [];
  const caps = getAdapterCaps(providerCfg);
  const inputMax = Math.min(
    toPositiveInt(categorySettings.input_context_max, Number.MAX_SAFE_INTEGER) ?? Number.MAX_SAFE_INTEGER,
    caps.input
  );
  const outputMax = Math.min(
    toPositiveInt(categorySettings.max_tokens, Number.MAX_SAFE_INTEGER) ?? Number.MAX_SAFE_INTEGER,
    caps.output
  );

  if (userValues.input_context_limit != null) {
    const value = toPositiveInt(userValues.input_context_limit, -1) ?? -1;
    if (value < USER_INPUT_MIN) {
      errors.push(`input_context_limit должен быть не меньше ${USER_INPUT_MIN}`);
    } else if (value % TOKEN_LIMIT_STEP !== 0) {
      errors.push(`input_context_limit должен быть кратен ${TOKEN_LIMIT_STEP}`);
    } else if (value > inputMax) {
      errors.push(`input_context_limit не может быть больше ${inputMax}`);
    }
  }
  if (userValues.output_generation_limit != null) {
    const value = toPositiveInt(userValues.output_generation_limit, -1) ?? -1;
    if (value < USER_OUTPUT_MIN) {
      errors.push(`output_generation_limit должен быть не меньше ${USER_OUTPUT_MIN}`);
    } else if (value % TOKEN_LIMIT_STEP !== 0) {
      errors.push(`output_generation_limit должен быть кратен ${TOKEN_LIMIT_STEP}`);
    } else if (value > outputMax) {
      errors.push(`output_generation_limit не может быть больше ${outputMax}`);
    }
  }

  return { ok: errors.length === 0, errors, inputMax, outputMax };
}

export {
  getProviderTimeout,
  getAdapterCaps,
  getInputLimit,
  getOutputLimit,
  estimateMessageTokens,
  validateInputLimit,
  validateUserLimits,
};
