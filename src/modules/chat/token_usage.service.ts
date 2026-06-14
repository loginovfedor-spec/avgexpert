import costLogger from '../cost/cost_logger.service';
import { getDatabasePort, ensureAppPgReady } from '../../core/pg';
import logger from '../../core/logger';
import type { ModelUsage } from '../../types/chat.types';
import { parseUsdField, shouldAutoBlockAfterCharge } from './billing.helpers';

const tokenUsageLogger = logger.scoped('TokenUsage');

type TokenUser = Record<string, unknown> & {
  username: string;
};

type RecordUsageAndCostParams = {
  user: TokenUser;
  usage: ModelUsage | null | undefined;
  source?: string;
  requestId?: string | null;
  providerId?: string;
  providerName?: string;
  adapterType?: string;
  modelName?: string;
  category?: string | null;
};

async function recordUsageAndCost({
  user,
  usage,
  source = 'chat',
  requestId,
  providerId = 'unknown',
  providerName = '',
  adapterType = '',
  modelName = '',
  category = null,
}: RecordUsageAndCostParams): Promise<void> {
  if (!user || !usage) return;

  const costUsd = usage.cost_usd || 0;

  try {
    await ensureAppPgReady();
    const db = getDatabasePort();

    await db.withTransaction(async (tx) => {
      // 1. Лог в request_cost_log (идемпотентность по request_id + provider_id)
      const inserted = await costLogger.logRequestCost({
        requestId,
        username: user.username,
        providerId,
        providerName,
        adapterType,
        modelName,
        usage,
        category,
        source
      }, tx);

      if (requestId && !inserted) {
        return;
      }

      // 2. Списание USD с баланса пользователя (если costUsd > 0)
      if (costUsd > 0) {
        await tx.run(`
          UPDATE users
          SET balance_usd = balance_usd - @costUsd,
              cost_usd_used = cost_usd_used + @costUsd
          WHERE username = @username
        `, { costUsd, username: user.username });

        // Запись транзакции в balance_transactions
        const recordedAt = Date.now();
        await tx.run(`
          INSERT INTO balance_transactions (
            username, amount, type, reference_type, reference_id,
            exchange_rate, amount_original, currency_original, recorded_at
          ) VALUES (
            @username, @amount, 'charge', 'llm_request', @referenceId,
            1.0, @amount, 'USD', @recordedAt
          )
        `, {
          username: user.username,
          amount: -costUsd,
          referenceId: requestId || null,
          recordedAt
        });

        // 3. Если доступный баланс (balance + credit_limit) исчерпан — блокируем пользователя
        const updatedUser = await tx.get<{ balance_usd: number | string; credit_limit_usd?: number | string }>(
          'SELECT balance_usd, credit_limit_usd FROM users WHERE username = @username',
          { username: user.username }
        );
        if (updatedUser) {
          const balanceUsd = parseUsdField(updatedUser.balance_usd);
          const creditLimitUsd = parseUsdField(updatedUser.credit_limit_usd);
          if (shouldAutoBlockAfterCharge(balanceUsd, creditLimitUsd)) {
            await tx.run(`
              UPDATE users
              SET is_blocked = true
              WHERE username = @username
            `, { username: user.username });
          }
        }
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    tokenUsageLogger.error('Failed to record usage and cost', { source, username: user.username, message });
    throw err;
  }
}

export { recordUsageAndCost };

