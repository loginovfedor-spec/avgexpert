import { $ } from '../index';
import { showToast } from '../ui';
import { fetchBalance, exportBalanceHistory } from '../api/billing.api';
import { formatCreditsLabel, formatMoneyAbs, formatOperationDate } from './format';
import type { BalanceOperation } from './types';

export function renderBalanceHistoryRows(operations: BalanceOperation[] = []): string {
  const parts: string[] = [];
  for (const op of operations) {
    const spentClass = op.spent > 0 ? 'is-usage' : 'is-muted';
    const spentText = op.spent > 0 ? formatMoneyAbs(op.spent) : '—';
    const recvClass = op.received > 0 ? 'is-positive' : 'is-muted';
    const recvText = op.received > 0 ? formatMoneyAbs(op.received) : '—';
    parts.push(
      '<div class="balance-history-row" role="row">' +
        `<div class="balance-history-date" role="cell">${formatOperationDate(op.date)}</div>` +
        `<div class="balance-history-operation" role="cell">${op.title}</div>` +
        `<div class="balance-history-received ${recvClass}" role="cell">${recvText}</div>` +
        `<div class="balance-history-change ${spentClass}" role="cell">${spentText}</div>` +
        `<div class="balance-history-balance" role="cell">${formatCreditsLabel(op.balance)}</div>` +
      '</div>'
    );
  }
  return parts.join('');
}

export function renderBalanceHistory(operations: BalanceOperation[] = []): void {
  const list = $('balance-history-list');
  const empty = $('balance-history-empty');
  if (!list || !empty) return;

  empty.classList.toggle('hidden', operations.length > 0);
  list.innerHTML = operations.length > 0 ? renderBalanceHistoryRows(operations) : '';
}

export function updateBalanceDisplay(balanceUsd: number): void {
  const balEl = $('user-tokens-balance');
  if (balEl) balEl.textContent = formatCreditsLabel(balanceUsd);
}

export async function refreshBalancePanel(): Promise<void> {
  try {
    const data = await fetchBalance();
    updateBalanceDisplay(data.balance || 0);
    renderBalanceHistory(data.operations || []);
  } catch (error) {
    console.error('Failed to load balance history', error);
  }
}

export async function exportBalanceHistoryCsv(): Promise<void> {
  try {
    const { blob, filename } = await exportBalanceHistory();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export balance history', error);
    showToast('Не удалось выгрузить историю операций', 'error');
  }
}
