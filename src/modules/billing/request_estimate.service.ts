import providersConfig from '../../core/providers.config';
import categoryRepository from '../admin/category.repository';
import userRepository from '../auth/user.repository';
import costCalculator from '../cost/cost_calculator.service';
import exchangeRateService from '../cost/exchange_rate.service';
import robokassaService from '../payments/robokassa.service';

type EstimateMessage = {
  role: string;
  content?: string | null;
};

type EstimateUser = {
  username: string;
  category?: string | null;
  allowed_categories?: string[];
  is_admin?: boolean | number;
  balance_usd?: number;
  credit_limit_usd?: number;
  output_generation_limit?: number | null;
  input_context_limit?: number | null;
};

type EstimateInput = {
  user: EstimateUser;
  messages: EstimateMessage[];
  category?: string | null;
  n_predict?: number | null;
};

function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 3.5);
}

function estimateInputTokens(messages: EstimateMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content || ''), 0);
}

function estimateOutputTokens(
  user: EstimateUser,
  categorySettings: Record<string, unknown>,
  nPredict?: number | null
): number {
  const categoryMax = parseInt(String(categorySettings.max_tokens ?? 128000), 10) || 128000;
  const userOutputLimit = parseInt(String(user.output_generation_limit), 10);
  const userOutputCap = Number.isFinite(userOutputLimit) ? userOutputLimit : Number.MAX_SAFE_INTEGER;
  const requested = parseInt(String(nPredict ?? 1024), 10) || 1024;
  return Math.min(requested, categoryMax, userOutputCap);
}

function resolveModelName(categorySettings: Record<string, unknown>): string {
  const providerId = String(categorySettings.provider || 'llamacpp');
  const providerCfg = providersConfig[providerId];
  const modelKeys = providerCfg?.models ? Object.keys(providerCfg.models) : [];
  return String(
    categorySettings.model_name ||
    providerCfg?.defaultModel ||
    modelKeys[0] ||
    'default'
  );
}

function calculateCostUsd(
  inputTokens: number,
  outputTokens: number,
  categorySettings: Record<string, unknown>
): { inputCostUsd: number; outputCostUsd: number; modelName: string } {
  const modelName = resolveModelName(categorySettings);
  const providerId = String(categorySettings.provider || 'llamacpp');
  const providerCfg = providersConfig[providerId] || {};
  const rates = costCalculator.parseCostRates(providerCfg, modelName);

  const inputUsage = { prompt_tokens: inputTokens, completion_tokens: 0, total_tokens: inputTokens };
  const outputUsage = { prompt_tokens: 0, completion_tokens: outputTokens, total_tokens: outputTokens };

  const inputCostUsd = costCalculator.calculateCost(inputUsage, rates);
  const outputCostUsd = costCalculator.calculateCost(outputUsage, rates);

  return { inputCostUsd, outputCostUsd, modelName };
}

export async function estimateRequestCost(input: EstimateInput) {
  const { user, messages, category, n_predict } = input;

  let categoryName = category || user.category || '';
  const allowed = user.allowed_categories || [];
  if (allowed.length > 0 && categoryName && !allowed.includes(categoryName)) {
    categoryName = user.category || categoryName;
  }

  const categorySettings = await categoryRepository.findByName(categoryName) as Record<string, unknown> | null || {};
  const complexity = Math.max(0.01, parseFloat(String(categorySettings.complexity ?? 1.0)) || 1.0);

  const rawInputTokens = estimateInputTokens(messages);
  const rawOutputTokens = estimateOutputTokens(user, categorySettings, n_predict);
  const inputTokens = Math.round(rawInputTokens * complexity);
  const outputTokens = Math.round(rawOutputTokens * complexity);

  const { inputCostUsd, outputCostUsd, modelName } = calculateCostUsd(inputTokens, outputTokens, categorySettings);

  const dbUser = await userRepository.findByUsername(user.username);
  const balanceUsd = dbUser?.balance_usd ?? user.balance_usd ?? 0;
  const creditLimitUsd = dbUser?.credit_limit_usd ?? user.credit_limit_usd ?? 0;

  return {
    requestChars: JSON.stringify(messages).length,
    inputTokens,
    outputTokens,
    inputCostUsd: Number(inputCostUsd.toFixed(6)),
    outputCostUsd: Number(outputCostUsd.toFixed(6)),
    totalCostUsd: Number((inputCostUsd + outputCostUsd).toFixed(6)),
    balanceUsd: Number(balanceUsd),
    creditLimitUsd: Number(creditLimitUsd),
    complexity,
    modelName,
  };
}

export async function getPaymentPackagesPreview() {
  const usdRate = await exchangeRateService.getRate('USD');
  const packages = Object.values(robokassaService.PACKAGES).map((pack: {
    id: string;
    amountRub: number;
    credits: number;
    name: string;
  }) => ({
    ...pack,
    creditedUsd: Number((pack.amountRub / usdRate).toFixed(4)),
  }));
  return { packages, usdRate };
}

export { estimateTokens };
