import { DatabasePort } from '../../core/pg/database.port';
import { ModelUsage, NormalizedRates } from '../../types/chat.types';

export interface LogRequestCostOptions {
  requestId?: string | null;
  username: string;
  providerId: string;
  providerName: string;
  adapterType: string;
  modelName: string;
  usage: ModelUsage;
  category?: string | null;
  source?: string;
}

class CostLoggerService {
  /** @returns true если строка вставлена; false при идемпотентном replay (request_id + provider_id уже есть) */
  async logRequestCost(options: LogRequestCostOptions, client: DatabasePort): Promise<boolean> {
    const {
      requestId,
      username,
      providerId,
      providerName,
      adapterType,
      modelName,
      usage,
      category,
      source = 'chat'
    } = options;

    const costUsd = usage.cost_usd || 0;
    
    const rates: NormalizedRates = usage._rates || {
      inputRate: 0,
      cachedRate: 0,
      outputRate: 0,
      costMode: 'standard',
      currency: 'USD',
      exchangeRate: 1.0
    };

    const sql = `
      INSERT INTO request_cost_log (
        request_id, username, provider_id, provider_name, adapter_type, model_name,
        input_tokens, cached_input_tokens, output_tokens, total_tokens, cost_usd,
        rate_input_per_token, rate_cached_input_per_token, rate_output_per_token,
        currency, exchange_rate, cost_mode, compute_seconds, rate_usd_per_hour,
        source, category, created_at
      ) VALUES (
        @requestId, @username, @providerId, @providerName, @adapterType, @modelName,
        @inputTokens, @cachedInputTokens, @outputTokens, @totalTokens, @costUsd,
        @rateInputPerToken, @rateCachedInputPerToken, @rateOutputPerToken,
        @currency, @exchangeRate, @costMode, @computeSeconds, @rateUsdPerHour,
        @source, @category, @createdAt
      )
      ON CONFLICT (request_id, provider_id) WHERE request_id IS NOT NULL DO NOTHING
    `;

    const params = {
      requestId: requestId || null,
      username,
      providerId,
      providerName,
      adapterType,
      modelName,
      inputTokens: usage.prompt_tokens || 0,
      cachedInputTokens: usage.cached_input_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      costUsd,
      rateInputPerToken: rates.inputRate,
      rateCachedInputPerToken: rates.cachedRate,
      rateOutputPerToken: rates.outputRate,
      currency: rates.currency,
      exchangeRate: rates.exchangeRate,
      costMode: rates.costMode,
      computeSeconds: usage.compute_seconds || 0,
      rateUsdPerHour: rates.rateUsdPerHour || 0,
      source,
      category: category || null,
      createdAt: Date.now()
    };

    const { changes } = await client.run(sql, params);
    return changes > 0;
  }
}

export default new CostLoggerService();
