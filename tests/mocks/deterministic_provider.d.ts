/**
 * DeterministicProvider — синтетический провайдер для тестов.
 * Возвращает предсказуемые события (delta, done, error, tool_call)
 * без обращения к внешним API.
 */
export class DeterministicProvider extends BaseProvider {
    constructor(options?: {});
    response: any;
    delayMs: any;
    shouldError: any;
    errorMessage: any;
    errorCode: any;
    finishReason: any;
    usage: any;
    chunks: any;
    toolCall: any;
    /**
     * Standard BaseProvider interface — used by ChatService.
     * @param {Array} messages
     * @param {Object} config  - Category config (ignored in mock)
     * @param {Object} options
     * @returns {AsyncGenerator}
     */
    handleChat(messages: any[], config?: Object, options?: Object): AsyncGenerator;
    /**
     * Convenience method for direct test usage.
     * @param {Array} messages
     * @param {Object} options
     * @returns {AsyncGenerator}
     */
    chat(messages: any[], options?: Object): AsyncGenerator;
    healthCheck(): Promise<{
        status: string;
        provider: string;
        latency: number;
    }>;
}
import BaseProvider = require("../../src/modules/providers/base.provider");
