import BaseProvider from '../../src/modules/providers/base.provider';
import ProviderEvents from '../../src/modules/providers/providerEvents';
import type { ChatMessage, ModelUsage, StreamEvent } from '../../src/types/chat.types';

export type DeterministicProviderOptions = {
  response?: string;
  delayMs?: number;
  shouldError?: boolean;
  errorMessage?: string;
  errorCode?: string;
  finishReason?: string;
  usage?: ModelUsage;
  chunks?: string[] | null;
  toolCall?: { id: string; name: string; arguments: string } | null;
};

/**
 * DeterministicProvider — синтетический провайдер для тестов.
 * Возвращает предсказуемые события (delta, done, error, tool_call)
 * без обращения к внешним API.
 */
export class DeterministicProvider extends BaseProvider {
  response: string;
  delayMs: number;
  shouldError: boolean;
  errorMessage: string;
  errorCode: string;
  finishReason: string;
  usage: ModelUsage;
  chunks: string[] | null;
  toolCall: { id: string; name: string; arguments: string } | null;

  constructor(options: DeterministicProviderOptions = {}) {
    super({ id: 'deterministic', name: 'DeterministicProvider', models: ['mock'], defaultModel: 'mock' });
    this.response = options.response ?? 'Hello from DeterministicProvider!';
    this.delayMs = options.delayMs ?? 0;
    this.shouldError = options.shouldError ?? false;
    this.errorMessage = options.errorMessage ?? 'Simulated provider error';
    this.errorCode = options.errorCode ?? 'provider_error';
    this.finishReason = options.finishReason ?? 'stop';
    this.usage = options.usage ?? { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    this.chunks = options.chunks ?? null;
    this.toolCall = options.toolCall ?? null;
  }

  async *handleChat(
    messages: ChatMessage[],
    _config: Record<string, unknown> = {},
    options: Record<string, unknown> = {}
  ): AsyncGenerator<StreamEvent> {
    yield* this.chat(messages, options);
  }

  async *chat(
    _messages: ChatMessage[],
    _options: Record<string, unknown> = {}
  ): AsyncGenerator<StreamEvent> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldError) {
      yield ProviderEvents.error(this.errorMessage, this.errorCode);
      return;
    }

    if (this.toolCall) {
      yield ProviderEvents.toolCall(this.toolCall);
      yield ProviderEvents.done(this.finishReason, this.usage);
      return;
    }

    if (this.chunks && Array.isArray(this.chunks)) {
      for (const chunk of this.chunks) {
        yield ProviderEvents.delta(chunk);
      }
      yield ProviderEvents.done(this.finishReason, this.usage);
      return;
    }

    yield ProviderEvents.delta(this.response);
    yield ProviderEvents.done(this.finishReason, this.usage);
  }

  async healthCheck(): Promise<{ status: string; provider: string; latency: number }> {
    return { status: 'online', provider: 'deterministic', latency: 0 };
  }
}
