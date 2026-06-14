export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface NormalizedRates {
  inputRate: number;        // USD за токен (поделено на 1_000_000)
  cachedRate: number;       // USD за токен (поделено на 1_000_000)
  outputRate: number;      // USD за токен (поделено на 1_000_000)
  costMode: string;
  currency: string;
  exchangeRate: number;
  rateUsdPerHour?: number;
  minBillableSeconds?: number;
}

export interface ModelUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number;
  cached_input_tokens?: number;
  cost_usd?: number;
  total_tokens: number;
  compute_seconds?: number;
  _rates?: NormalizedRates;
  _costMode?: string;
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
