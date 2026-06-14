import { ModelUsage, NormalizedRates } from '../../types/chat.types';
import { MODEL_RATES } from './rates.config';
import exchangeRateService from './exchange_rate.service';

/**
 * Парсит значение из env-переменной как float.
 * Возвращает fallback если значение отсутствует, пустое или NaN.
 */
function parseEnvFloat(env: Record<string, unknown>, key: string, fallback: number): number;
function parseEnvFloat(env: Record<string, unknown>, key: string, fallback: null): number | null;
function parseEnvFloat(env: Record<string, unknown>, key: string, fallback: number | null): number | null {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseFloat(String(raw));
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Нормализует имя модели: убирает gpt://{folder}/ (Yandex Cloud),
 * суффиксы /latest, :latest, :default, и другие префиксные разделители.
 */
function getBaseModelName(modelName: string): string {
  let name = modelName;
  // 1. Отрезаем gpt://{folder}/ для Yandex Cloud
  if (name.startsWith('gpt://')) {
    const parts = name.split('/');
    if (parts.length > 3) {
      name = parts.slice(3).join('/'); // берем все, что после folderId
    }
  }
  // 2. Убираем /latest или :latest
  name = name.replace(/[\/:](?:latest|default)$/i, '');
  // 3. Убираем двоеточие и префиксы, если они есть
  if (name.includes(':') && !name.startsWith('gpt://')) {
    name = name.substring(name.indexOf(':') + 1);
  }
  return name.trim();
}

export { getBaseModelName };

export class CostCalculatorService {
  /**
   * Конвертирует сумму в оригинальной валюте в USD по курсу.
   * exchangeRate > 1 — прямая котировка (напр. 90 RUB/USD → делим).
   * exchangeRate ≤ 1 и > 0 — обратная котировка (напр. 0.011 USD/RUB → множим).
   */
  private _toUsd(amount: number, rates: NormalizedRates): number {
    if (Number.isNaN(amount) || !Number.isFinite(amount)) return 0;
    if (rates.currency === 'USD') return amount;
    if (rates.exchangeRate > 1.0) return amount / rates.exchangeRate;
    if (rates.exchangeRate > 0) return amount * rates.exchangeRate;
    return amount;
  }

  parseCostRates(config: Record<string, any> | null | undefined, modelName: string): NormalizedRates {
    const env = config?._env || config || {};
    
    let costMode = env.COST_MODE || 'standard';
    let currency = env.COST_CURRENCY || 'USD';
    let exchangeRate = parseEnvFloat(env, 'COST_EXCHANGE_RATE', 1.0);

    if (costMode === 'compute') {
      return {
        inputRate: 0,
        cachedRate: 0,
        outputRate: 0,
        costMode,
        currency,
        exchangeRate,
        rateUsdPerHour: parseEnvFloat(env, 'COST_USD_PER_HOUR', 0.0),
        minBillableSeconds: parseEnvFloat(env, 'COST_MIN_BILLABLE_SECONDS', 1.0)
      };
    }

    let input1M = parseEnvFloat(env, 'COST_USD_PER_1M_INPUT', null);
    let cached1M = parseEnvFloat(env, 'COST_USD_PER_1M_CACHED_INPUT', null);
    let output1M = parseEnvFloat(env, 'COST_USD_PER_1M_OUTPUT', null);

    if (input1M === null || output1M === null) {
      const defaultModel = env.DEFAULT_MODEL || '';
      const baseModel = getBaseModelName(modelName);
      const baseDefaultModel = getBaseModelName(defaultModel);
      const fallbackRate = MODEL_RATES[modelName] || 
                           MODEL_RATES[baseModel] || 
                           MODEL_RATES[defaultModel] || 
                           MODEL_RATES[baseDefaultModel] || 
                           null;
      if (fallbackRate) {
        input1M = fallbackRate.input;
        cached1M = fallbackRate.cached !== undefined ? fallbackRate.cached : 0;
        output1M = fallbackRate.output;
        costMode = fallbackRate.costMode || costMode;
        currency = fallbackRate.currency || currency;
        exchangeRate = fallbackRate.exchangeRate !== undefined ? fallbackRate.exchangeRate : exchangeRate;
      } else {
        input1M = 0;
        cached1M = 0;
        output1M = 0;
      }
    }

    if (cached1M === null) {
      cached1M = 0;
    }

    if (currency === 'RUB' && exchangeRate === 1.0) {
      exchangeRate = exchangeRateService.getCachedRate('USD');
    }

    return {
      inputRate: input1M / 1_000_000,
      cachedRate: cached1M / 1_000_000,
      outputRate: output1M / 1_000_000,
      costMode,
      currency,
      exchangeRate
    };
  }

  calculateCost(usage: ModelUsage, rates: NormalizedRates): number {
    if (rates.costMode === 'compute') {
      const ratePerHour = rates.rateUsdPerHour || 0;
      const minSec = rates.minBillableSeconds !== undefined ? rates.minBillableSeconds : 1;
      const elapsed = usage.compute_seconds || 0;
      const billableSeconds = Math.max(minSec, elapsed);
      const originalCost = (billableSeconds / 3600) * ratePerHour;
      return this._toUsd(originalCost, rates);
    }

    const promptTokens = usage.prompt_tokens || 0;
    const cachedTokens = usage.cached_input_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;

    const freshInput = Math.max(0, promptTokens - cachedTokens);
    
    const originalCost = (freshInput * rates.inputRate) + 
                         (cachedTokens * rates.cachedRate) + 
                         (completionTokens * rates.outputRate);

    return this._toUsd(originalCost, rates);
  }

  enrichUsage(
    usage: ModelUsage | null | undefined, 
    ctx: { providerId: string; modelName: string; config: any; computeSeconds?: number }
  ): ModelUsage {
    if (!usage) {
      return { 
        prompt_tokens: 0, 
        completion_tokens: 0, 
        total_tokens: 0, 
        cost_usd: 0,
        compute_seconds: ctx.computeSeconds
      };
    }

    const usageWithCompute = {
      ...usage,
      compute_seconds: ctx.computeSeconds !== undefined ? ctx.computeSeconds : usage.compute_seconds
    };

    const rates = this.parseCostRates(ctx.config, ctx.modelName);
    const costUsd = this.calculateCost(usageWithCompute, rates);

    const roundedCost = Math.round(costUsd * 1e8) / 1e8;

    return {
      ...usageWithCompute,
      cost_usd: roundedCost,
      _rates: rates,
      _costMode: rates.costMode
    };
  }
}

export default new CostCalculatorService();
