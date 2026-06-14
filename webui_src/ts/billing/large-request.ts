import { $, t } from '../index';
import { estimateRequestCost } from '../api/billing.api';
import { formatCreditsLabel, formatInteger } from './format';
import type { RequestCostEstimate } from './types';
import type { ChatMessage } from '../types';

const LARGE_REQUEST_CHARS = 100_000;

let largeRequestModalReady = false;
let largeRequestResolver: ((result: boolean) => void) | null = null;

export function getRequestCharSize(messages: ChatMessage[]): number {
  return JSON.stringify(messages).length;
}

export function isLargeRequest(messages: ChatMessage[]): boolean {
  if (getRequestCharSize(messages) > LARGE_REQUEST_CHARS) return true;
  return messages.some((m) => (m.content || '').length > LARGE_REQUEST_CHARS);
}

function closeLargeRequestModal(result: boolean): void {
  $('large-request-modal')?.classList.add('hidden');
  if (largeRequestResolver) {
    const resolve = largeRequestResolver;
    largeRequestResolver = null;
    resolve(result);
  }
}

function hasSufficientFunds(estimate: RequestCostEstimate): boolean {
  const available = (estimate.balanceUsd || 0) + (estimate.creditLimitUsd || 0);
  return available >= estimate.totalCostUsd;
}

export function renderLargeRequestEstimate(estimate: RequestCostEstimate): void {
  const container = $('large-request-estimate');
  if (!container) return;

  const rows = [
    { label: t('large_request_size', { chars: formatInteger(estimate.requestChars) }), className: '' },
    { label: t('large_request_input', { amount: formatCreditsLabel(estimate.inputCostUsd) }), className: '' },
    {
      label: t('large_request_output', {
        tokens: formatInteger(estimate.outputTokens),
        amount: formatCreditsLabel(estimate.outputCostUsd),
      }),
      className: '',
    },
    { label: t('large_request_total', { amount: formatCreditsLabel(estimate.totalCostUsd) }), className: 'is-total' },
    { label: t('large_request_balance', { amount: formatCreditsLabel(estimate.balanceUsd) }), className: 'is-balance' },
  ];

  if (!hasSufficientFunds(estimate)) {
    rows.push({ label: t('large_request_insufficient'), className: 'is-warning' });
  }

  container.innerHTML = rows.map((row) =>
    `<div class="large-request-estimate-row ${row.className}"><span>${row.label}</span></div>`
  ).join('');

  const confirmBtn = $<HTMLButtonElement>('large-request-confirm');
  if (confirmBtn) confirmBtn.disabled = !hasSufficientFunds(estimate);
}

export function initLargeRequestModal(): void {
  if (largeRequestModalReady) return;
  largeRequestModalReady = true;

  $('large-request-confirm')?.addEventListener('click', () => closeLargeRequestModal(true));
  $('large-request-cancel')?.addEventListener('click', () => closeLargeRequestModal(false));
  $('large-request-modal-close')?.addEventListener('click', () => closeLargeRequestModal(false));
  $('large-request-modal-backdrop')?.addEventListener('click', () => closeLargeRequestModal(false));
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if ($('large-request-modal')?.classList.contains('hidden')) return;
    closeLargeRequestModal(false);
  });
}

export async function confirmLargeRequest(
  messages: ChatMessage[],
  options: { category?: string | null; n_predict?: number | null }
): Promise<boolean> {
  initLargeRequestModal();

  const estimate = await estimateRequestCost({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    category: options.category ?? null,
    n_predict: options.n_predict ?? null,
  });

  renderLargeRequestEstimate(estimate);
  $('large-request-modal')?.classList.remove('hidden');
  $<HTMLButtonElement>('large-request-confirm')?.focus();

  return new Promise<boolean>((resolve) => {
    largeRequestResolver = resolve;
  });
}
