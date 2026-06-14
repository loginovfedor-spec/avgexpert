import logger from '../../../core/logger';
import yandex from './yandex';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';

const yandexFileSearchLogger = logger.scoped('YandexFileSearch');

yandexFileSearchLogger.warn(
  'yandex_file_search adapter is deprecated (S4/S9). Use provider "yandex" with RAG_V2 inject-only path.'
);

type CategoryConfig = Record<string, unknown>;

class YandexFileSearchProvider {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  capabilities: { stream: boolean; tools: boolean };

  constructor() {
    this.id = 'yandex_file_search';
    this.name = 'Yandex Prompt + File Search (deprecated)';
    this.models = yandex.models;
    this.defaultModel = yandex.defaultModel;
    this.capabilities = { stream: true, tools: false };
  }

  async *handleChat(
    messages: ChatMessage[],
    categoryConfig: CategoryConfig,
    options: Record<string, unknown> = {}
  ): AsyncIterable<StreamEvent> {
    yandexFileSearchLogger.warn(
      'yandex_file_search.handleChat: deprecated — delegating to yandex adapter (no embed/search)'
    );
    yield* yandex.handleChat(
      messages,
      { ...categoryConfig, provider: 'yandex_file_search' },
      options
    );
  }

  async getModels(categoryConfig: CategoryConfig): Promise<string[]> {
    return yandex.getModels({ ...categoryConfig, provider: 'yandex_file_search' });
  }

  async checkHealth(categoryConfig: CategoryConfig): Promise<boolean> {
    return yandex.checkHealth({ ...categoryConfig, provider: 'yandex_file_search' });
  }
}

const instance = new YandexFileSearchProvider();
export = instance;
