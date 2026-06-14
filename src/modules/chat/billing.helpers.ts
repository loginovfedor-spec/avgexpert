import type { ModelUsage } from '../../types/chat.types';

type BillingGuardRow = {
  balance_usd: number | string;
  credit_limit_usd?: number | string | null;
  is_blocked: boolean;
};

export class BillingGuardError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 403) {
    super(message);
    this.name = 'BillingGuardError';
    this.code = code;
    this.status = status;
  }
}

export function parseUsdField(value: number | string | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'string' ? parseFloat(value) : Number(value);
}

export function getAvailableUsd(balanceUsd: number, creditLimitUsd: number): number {
  return balanceUsd + creditLimitUsd;
}

export function hasInsufficientFunds(balanceUsd: number, creditLimitUsd: number): boolean {
  return getAvailableUsd(balanceUsd, creditLimitUsd) <= 0;
}

export function shouldAutoBlockAfterCharge(balanceUsd: number, creditLimitUsd: number): boolean {
  return balanceUsd <= -creditLimitUsd;
}

export function assertUserCanSpendFunds(row: BillingGuardRow): void {
  if (row.is_blocked) {
    throw new BillingGuardError(
      'Доступ к моделям заблокирован. Обратитесь к администратору.',
      'user_blocked'
    );
  }
  const balanceUsd = parseUsdField(row.balance_usd);
  const creditLimitUsd = parseUsdField(row.credit_limit_usd);
  if (hasInsufficientFunds(balanceUsd, creditLimitUsd)) {
    throw new BillingGuardError(
      'Недостаточно средств на балансе. Доступ к моделям заблокирован.',
      'insufficient_funds'
    );
  }
}

type RecordUsageUser = { username: string; [k: string]: unknown };

type StreamResult = {
  usage?: ModelUsage | null;
  providerId: string;
  providerInfo?: { model?: string } | null;
};

type ProviderCfg = Record<string, unknown> & {
  name?: string;
  adapter?: string;
};

type CategorySettings = Record<string, unknown> & {
  model_name?: string;
  id?: string;
};

type ChatBody = {
  run_id?: string;
  runId?: string;
  [k: string]: unknown;
};

/**
 * Собирает параметры для вызова recordUsageAndCost().
 * Устраняет дублирование между chat.controller.ts (fast path)
 * и chat.service.ts (heavy path).
 */
export function buildRecordUsageParams(opts: {
  user: RecordUsageUser;
  result: StreamResult;
  providerCfg: ProviderCfg;
  catSettings: CategorySettings;
  body: ChatBody;
  source: string;
}) {
  const { user, result, providerCfg, catSettings, body, source } = opts;
  return {
    user,
    usage: result.usage,
    source,
    requestId: body.run_id || body.runId || null,
    providerId: result.providerId,
    providerName: providerCfg.name || result.providerId || '',
    adapterType: providerCfg.adapter || '',
    modelName: catSettings.model_name || result.providerInfo?.model || 'default',
    category: (catSettings.id as string) || null,
  };
}
