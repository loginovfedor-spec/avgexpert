const BaseProvider = require('../../src/modules/providers/base.provider');
const ProviderEvents = require('../../src/modules/providers/providerEvents');

/**
 * DeterministicProvider — синтетический провайдер для тестов.
 * Возвращает предсказуемые события (delta, done, error, tool_call)
 * без обращения к внешним API.
 */
class DeterministicProvider extends BaseProvider {
  constructor(options = {}) {
    super({ id: 'deterministic', name: 'DeterministicProvider', models: ['mock'], defaultModel: 'mock' });
    this.response = options.response ?? 'Hello from DeterministicProvider!';
    this.delayMs = options.delayMs ?? 0;
    this.shouldError = options.shouldError ?? false;
    this.errorMessage = options.errorMessage ?? 'Simulated provider error';
    this.errorCode = options.errorCode ?? 'provider_error';
    this.finishReason = options.finishReason ?? 'stop';
    this.usage = options.usage ?? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    this.chunks = options.chunks ?? null; // Array of strings for multi-chunk mode
    this.toolCall = options.toolCall ?? null; // Object for tool_call mode
  }

  /**
   * Standard BaseProvider interface — used by ChatService.
   * @param {Array} messages
   * @param {Object} config  - Category config (ignored in mock)
   * @param {Object} options
   * @returns {AsyncGenerator}
   */
  async *handleChat(messages, config = {}, options = {}) {
    yield* this.chat(messages, options);
  }

  /**
   * Convenience method for direct test usage.
   * @param {Array} messages
   * @param {Object} options
   * @returns {AsyncGenerator}
   */
  async *chat(messages, options = {}) {
    // Optional delay to simulate network latency
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    // Error mode
    if (this.shouldError) {
      yield ProviderEvents.error(this.errorMessage, this.errorCode);
      return;
    }

    // Tool call mode
    if (this.toolCall) {
      yield ProviderEvents.toolCall(this.toolCall);
      yield ProviderEvents.done(this.finishReason, this.usage);
      return;
    }

    // Multi-chunk mode
    if (this.chunks && Array.isArray(this.chunks)) {
      for (const chunk of this.chunks) {
        yield ProviderEvents.delta(chunk);
      }
      yield ProviderEvents.done(this.finishReason, this.usage);
      return;
    }

    // Normal single-response mode
    yield ProviderEvents.delta(this.response);
    yield ProviderEvents.done(this.finishReason, this.usage);
  }

  async healthCheck() {
    return { status: 'online', provider: 'deterministic', latency: 0 };
  }
}

module.exports = { DeterministicProvider };
