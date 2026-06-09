export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface ModelUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number;
  total_tokens: number;
}

export interface StreamEvent {
  type: 'delta' | 'done' | 'error' | 'tool_call' | 'provider_selected';
  text?: string;
  finishReason?: string | null;
  usage?: ModelUsage | null;
  message?: string;
  code?: string;
  toolCall?: unknown;
  toolCalls?: unknown[];
  providerId?: string;
  providerName?: string;
  model?: string;
}
