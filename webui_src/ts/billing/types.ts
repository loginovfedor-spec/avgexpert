export interface BalanceOperation {
  date: number;
  title: string;
  spent: number;
  received: number;
  balance: number;
}

export interface BalanceResponse {
  balance: number;
  operations: BalanceOperation[];
}

export interface PaymentPackage {
  id: string;
  amountRub: number;
  name: string;
  credits?: number;
  tokens?: number;
  creditedUsd?: number;
}

export interface PaymentPackagesResponse {
  packages: PaymentPackage[];
  usdRate: number;
}

export interface RequestCostEstimate {
  requestChars: number;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  balanceUsd: number;
  creditLimitUsd: number;
  complexity: number;
  modelName?: string;
}

export interface AdminBillingFields {
  balance_usd?: number;
  credit_limit_usd?: number;
  cost_usd_used?: number;
  is_blocked?: boolean | number;
  is_admin?: boolean | number;
}
