import { apiFetch, apiFetchBlob } from './client';
import type {
  BalanceResponse,
  PaymentPackagesResponse,
  RequestCostEstimate,
} from '../billing/types';

export function fetchBalance(): Promise<BalanceResponse> {
  return apiFetch<BalanceResponse>('/api/users/me/balance');
}

export async function exportBalanceHistory(): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetchBlob('/api/users/me/balance/export');
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || 'balance-history.csv';
  return { blob: await response.blob(), filename };
}

export function fetchExchangeRate(): Promise<{ rate: number }> {
  return apiFetch<{ rate: number }>('/api/payments/exchange-rate');
}

export function fetchPaymentPackages(): Promise<PaymentPackagesResponse> {
  return apiFetch<PaymentPackagesResponse>('/api/payments/packages');
}

export function createRobokassaPayment(payload: { amount_rub: number }): Promise<{ payment_url?: string; detail?: string }> {
  return apiFetch('/api/payments/robokassa/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface EstimateRequestPayload {
  messages: Array<{ role: string; content?: string | null }>;
  category?: string | null;
  n_predict?: number | null;
}

export function estimateRequestCost(payload: EstimateRequestPayload): Promise<RequestCostEstimate> {
  return apiFetch<RequestCostEstimate>('/api/chat/estimate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
