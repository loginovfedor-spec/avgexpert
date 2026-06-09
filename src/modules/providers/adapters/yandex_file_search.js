/**
 * @deprecated S4/S9: use provider "yandex" with RAG_V2 inject-only path.
 * Embed/search removed in S9 — delegates to yandex.js (LLM-only).
 */
const logger = require('../../../core/logger').scoped('YandexFileSearch');
const yandex = require('./yandex');

logger.warn(
  'yandex_file_search adapter is deprecated (S4/S9). Use provider "yandex" with RAG_V2 inject-only path.'
);

class YandexFileSearchProvider {
  constructor() {
    this.id = 'yandex_file_search';
    this.name = 'Yandex Prompt + File Search (deprecated)';
    this.models = yandex.models;
    this.defaultModel = yandex.defaultModel;
    this.capabilities = { stream: true, tools: false };
  }

  async *handleChat(messages, categoryConfig, options = {}) {
    logger.warn(
      'yandex_file_search.handleChat: deprecated — delegating to yandex adapter (no embed/search)'
    );
    yield* yandex.handleChat(
      messages,
      { ...categoryConfig, provider: 'yandex_file_search' },
      options
    );
  }

  async getModels(categoryConfig) {
    return yandex.getModels({ ...categoryConfig, provider: 'yandex_file_search' });
  }

  async checkHealth(categoryConfig) {
    return yandex.checkHealth({ ...categoryConfig, provider: 'yandex_file_search' });
  }
}

const instance = new YandexFileSearchProvider();
module.exports = instance;
module.exports.YandexFileSearchProvider = YandexFileSearchProvider;
