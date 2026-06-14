import { $ } from '../index';
import { formatCreditsLabel, formatMoney, parseMoneyInput } from './format';
import type { AdminBillingFields } from './types';

export function formatAdminBalanceSummary(user: AdminBillingFields): string {
  const balance = user.balance_usd ?? 0;
  const limit = user.credit_limit_usd ?? 0;
  const used = user.cost_usd_used ?? 0;
  return `Баланс: ${formatCreditsLabel(balance)} | лимит овердрафта: ${formatCreditsLabel(limit)} | расход: ${formatCreditsLabel(used)}`;
}

export function setAdminBillingFields(user: AdminBillingFields | null | undefined): void {
  const balanceEl = $<HTMLInputElement>('admin-balance-usd');
  const limitEl = $<HTMLInputElement>('admin-credit-limit-usd');
  const usedEl = $<HTMLInputElement>('admin-cost-usd-used');
  if (balanceEl) balanceEl.value = formatMoney(user?.balance_usd ?? 0, { detail: true });
  if (limitEl) limitEl.value = formatMoney(user?.credit_limit_usd ?? 0, { detail: true });
  if (usedEl) usedEl.value = formatMoney(user?.cost_usd_used ?? 0, { detail: true });
}

export function readAdminBillingPayload(): { balance_usd: number; credit_limit_usd: number } {
  const balance = parseMoneyInput($<HTMLInputElement>('admin-balance-usd')?.value || '');
  const creditLimit = parseMoneyInput($<HTMLInputElement>('admin-credit-limit-usd')?.value || '');
  return {
    balance_usd: balance,
    credit_limit_usd: creditLimit,
  };
}

export function isUserBlocked(user: AdminBillingFields): boolean {
  if (user.is_blocked) return true;
  if (user.is_admin) return false;
  const available = (user.balance_usd ?? 0) + (user.credit_limit_usd ?? 0);
  return available <= 0;
}
