import { ChatMessage, StreamEvent } from './chat.types';

export interface ProviderCapabilities {
  stream: boolean;
  tools: boolean;
  [key: string]: unknown;
}

export interface ProviderConfig {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  capabilities?: ProviderCapabilities;
}

export interface RequestOptions {
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface AdapterInterface {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  capabilities: ProviderCapabilities;

  handleChat(
    messages: ChatMessage[],
    config: Record<string, unknown>,
    options: RequestOptions
  ): AsyncIterable<StreamEvent>;

  checkHealth(config: Record<string, unknown>): Promise<boolean>;
  getModels(config: Record<string, unknown>): Promise<string[]>;
}
