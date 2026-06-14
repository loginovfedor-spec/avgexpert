export interface ModelRate {
  input: number;        // USD за 1M токенов
  cached?: number;      // USD за 1M токенов
  output: number;       // USD за 1M токенов
  costMode?: string;
  currency?: string;
  exchangeRate?: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  'gpt-5.5': { input: 5.00, cached: 0.50, output: 30.00, costMode: 'standard' },
  'o3-mini': { input: 1.10, cached: 0.275, output: 4.40, costMode: 'standard' },
  'gpt-4.1': { input: 2.00, cached: 0.50, output: 8.00, costMode: 'standard' },
  'gpt-4.1-mini': { input: 0.40, cached: 0.10, output: 1.60, costMode: 'standard' },
  'deepseek-v4-flash': { input: 0.14, cached: 0.0028, output: 0.28, costMode: 'standard' },
  'deepseek-reasoner': { input: 0.14, cached: 0.0028, output: 0.28, costMode: 'standard' },
  'deepseek-v4-pro': { input: 0.435, cached: 0.003625, output: 0.87, costMode: 'standard' },
  'deepseek-chat': { input: 0.14, cached: 0.0028, output: 0.28, costMode: 'standard' },
  'grok-4.20-non-reasoning': { input: 1.25, cached: 0.20, output: 2.50, costMode: 'standard' },
  'grok-4.20-reasoning': { input: 1.25, cached: 0.20, output: 2.50, costMode: 'standard' },
  'grok-4.3': { input: 1.25, cached: 0.20, output: 2.50, costMode: 'standard' },
  'gemini-3.1-flash-lite': { input: 0.25, cached: 0.025, output: 1.50, costMode: 'standard' },
  'gemini-3.5-flash': { input: 1.50, cached: 0.15, output: 9.00, costMode: 'standard' },
  'gemini-3.1-pro': { input: 2.00, cached: 0.20, output: 12.00, costMode: 'standard' },
  'gemini-2.5-flash': { input: 1.50, cached: 0.15, output: 9.00, costMode: 'standard' },
  'gemini-2.5-pro': { input: 2.00, cached: 0.20, output: 12.00, costMode: 'standard' },
  'gemini-2.0-flash': { input: 1.50, cached: 0.15, output: 9.00, costMode: 'standard' },
  'grok-4-1-fast-non-reasoning': { input: 1.25, cached: 0.20, output: 2.50, costMode: 'standard' },
  'grok-4-1-fast-reasoning': { input: 1.25, cached: 0.20, output: 2.50, costMode: 'standard' },
  'grok-3': { input: 1.25, cached: 0.20, output: 2.50, costMode: 'standard' },
  'qwen-plus': { input: 0.40, cached: 0.04, output: 1.60, costMode: 'standard' },
  'qwen-max': { input: 1.25, cached: 0.125, output: 3.75, costMode: 'standard' },
  'qwen-turbo': { input: 0.19, cached: 0.019, output: 1.13, costMode: 'standard' },
  'qwen3.6-flash': { input: 0.19, cached: 0.019, output: 1.13, costMode: 'standard' },
  'qwen3.7-plus': { input: 0.40, cached: 0.04, output: 1.60, costMode: 'standard' },
  'qwen3.7-max': { input: 1.25, cached: 0.125, output: 3.75, costMode: 'standard' },
  'aliceai-llm-flash': { input: 4.10, output: 4.10, costMode: 'sync', currency: 'RUB', exchangeRate: 1.0 },
  'aliceai-llm': { input: 4.10, output: 4.10, costMode: 'sync', currency: 'RUB', exchangeRate: 1.0 },
  'qwen2.5-7b-instruct': { input: 0, output: 0, costMode: 'standard' }
};
