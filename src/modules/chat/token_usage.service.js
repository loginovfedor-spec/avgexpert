const userRepository = require('../auth/user.repository');
const logger = require('../../core/logger').scoped('TokenUsage');

async function recordTokenUsage({ user, usage, complexity = 1.0, source = 'chat' }) {
  if (!user || !usage) return null;

  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  if (inputTokens <= 0 && outputTokens <= 0) return null;

  try {
    const newBalance = await userRepository.addTokenUsage(user.username, inputTokens, outputTokens, complexity);
    if (newBalance && newBalance.allocated > 0 && newBalance.balance <= 0) {
      await userRepository.archiveAndBlock(user.username, 'tokens_exhausted');
    }
    return newBalance;
  } catch (err) {
    logger.error('Failed to record usage', { source, username: user.username, message: err.message });
    return null;
  }
}

module.exports = { recordTokenUsage };
