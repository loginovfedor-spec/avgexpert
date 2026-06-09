const USER_INPUT_MIN = 0;
const USER_INPUT_MAX = 1000;
const USER_OUTPUT_MIN = 0;
const USER_OUTPUT_MAX = 128;
const TOKENS_PER_CREDIT = 1000;
// Conservative upper bound for a single message body (~4 chars/token at max input budget).
const MAX_MESSAGE_CONTENT_CHARS = USER_INPUT_MAX * TOKENS_PER_CREDIT * 4;

function toPositiveInt(value, fallback = null) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clamp(value, min, max) {
  const n = toPositiveInt(value, min);
  return Math.min(Math.max(n, min), max);
}

function creditsToTokens(credits) {
  return toPositiveInt(credits, 0) * TOKENS_PER_CREDIT;
}

function getAdapterCaps(providerCfg = {}) {
  const env = providerCfg._env || {};
  const extra = providerCfg.extra_params || {};
  const inputCap = toPositiveInt(
    env.MAX_INPUT_CONTEXT_TOKENS ||
    env.MAX_CONTEXT_TOKENS ||
    env.N_CTX ||
    providerCfg.max_input_context_tokens ||
    extra.max_input_context_tokens,
    Number.MAX_SAFE_INTEGER
  );
  const outputCap = toPositiveInt(
    env.MAX_OUTPUT_GENERATION_TOKENS ||
    env.MAX_OUTPUT_TOKENS ||
    providerCfg.max_output_generation_tokens ||
    extra.max_tokens,
    Number.MAX_SAFE_INTEGER
  );

  return {
    input: inputCap,
    output: outputCap,
  };
}

function getInputLimit(user = {}, categorySettings = {}, providerCfg = {}) {
  const caps = getAdapterCaps(providerCfg);
  const categoryMax = toPositiveInt(categorySettings.input_context_max, Number.MAX_SAFE_INTEGER);
  const categoryDefault = toPositiveInt(categorySettings.input_context_default, categoryMax);
  const requestedTokens = user.input_context_credits != null
    ? creditsToTokens(user.input_context_credits)
    : categoryDefault;
  return clamp(requestedTokens, 0, Math.min(categoryMax, caps.input));
}

function getOutputLimit(user = {}, categorySettings = {}, providerCfg = {}) {
  const caps = getAdapterCaps(providerCfg);
  const categoryMax = toPositiveInt(categorySettings.max_tokens, Number.MAX_SAFE_INTEGER);
  const requestedTokens = user.output_generation_credits != null
    ? creditsToTokens(user.output_generation_credits)
    : categoryMax;
  return clamp(requestedTokens, 0, Math.min(categoryMax, caps.output));
}

function estimateMessageTokens(messages = []) {
  const text = messages.map(m => {
    if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) return m.content.map(part => part?.text || '').join(' ');
    return JSON.stringify(m.content || '');
  }).join('\n');
  return Math.ceil(text.length / 4);
}

function validateInputLimit(messages, user, categorySettings, providerCfg) {
  const limit = getInputLimit(user, categorySettings, providerCfg);
  const estimated = estimateMessageTokens(messages);
  if (estimated > limit) {
    const err = new Error(`Входной контекст превышает лимит: ${estimated} из ${limit} токенов.`);
    err.status = 400;
    err.code = 'input_context_limit_exceeded';
    err.details = { estimated, limit };
    throw err;
  }
  return { estimated, limit };
}

function validateUserLimits({ userValues = {}, categorySettings = {}, providerCfg = {} }) {
  const errors = [];

  if (userValues.input_context_credits != null) {
    const value = toPositiveInt(userValues.input_context_credits, -1);
    if (value < USER_INPUT_MIN || value > USER_INPUT_MAX) {
      errors.push(`input_context_credits должен быть от ${USER_INPUT_MIN} до ${USER_INPUT_MAX}`);
    }
  }
  if (userValues.output_generation_credits != null) {
    const value = toPositiveInt(userValues.output_generation_credits, -1);
    if (value < USER_OUTPUT_MIN || value > USER_OUTPUT_MAX) {
      errors.push(`output_generation_credits должен быть от ${USER_OUTPUT_MIN} до ${USER_OUTPUT_MAX}`);
    }
  }

  return { ok: errors.length === 0, errors, inputMax: USER_INPUT_MAX, outputMax: USER_OUTPUT_MAX };
}

module.exports = {
  USER_INPUT_MIN,
  USER_INPUT_MAX,
  USER_OUTPUT_MIN,
  USER_OUTPUT_MAX,
  TOKENS_PER_CREDIT,
  MAX_MESSAGE_CONTENT_CHARS,
  creditsToTokens,
  getAdapterCaps,
  getInputLimit,
  getOutputLimit,
  estimateMessageTokens,
  validateInputLimit,
  validateUserLimits,
};
