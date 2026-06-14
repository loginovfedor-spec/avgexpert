import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function mockBrowserStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    configurable: true,
  });
}

describe('billing/format', () => {
  it('formatMoney preserves fractional USD', async () => {
    const { formatMoney } = await import('../../webui_src/ts/billing/format');
    assert.equal(formatMoney(0.052), '0,052');
    assert.notEqual(formatMoney(0.052), '0');
    assert.match(formatMoney(0.052, { detail: true }), /^0,052/);
  });

  it('formatMoneyAbs returns dash for zero', async () => {
    const { formatMoneyAbs } = await import('../../webui_src/ts/billing/format');
    assert.equal(formatMoneyAbs(0), '—');
    assert.equal(formatMoneyAbs(-0.25), '0,25');
  });

  it('formatCreditsLabel formats without dollar sign', async () => {
    const { formatCreditsLabel } = await import('../../webui_src/ts/billing/format');
    assert.equal(formatCreditsLabel(10.5), '10,50');
    assert.doesNotMatch(formatCreditsLabel(10.5), /^\$/);
  });

  it('formatUsdLabel is deprecated alias without dollar sign', async () => {
    const { formatUsdLabel } = await import('../../webui_src/ts/billing/format');
    assert.equal(formatUsdLabel(10.5), '10,50');
    assert.doesNotMatch(formatUsdLabel(10.5), /^\$/);
  });

  it('parseMoneyInput handles ru-RU comma decimals', async () => {
    const { parseMoneyInput } = await import('../../webui_src/ts/billing/format');
    assert.equal(parseMoneyInput('10,50'), 10.5);
    assert.equal(parseMoneyInput('1 234,56'), 1234.56);
    assert.equal(parseMoneyInput('0,052'), 0.052);
    assert.equal(parseMoneyInput(''), 0);
    assert.equal(parseMoneyInput('  '), 0);
    assert.equal(parseMoneyInput('abc'), 0);
  });

  it('formatInteger clamps negative values', async () => {
    const { formatInteger } = await import('../../webui_src/ts/billing/format');
    assert.equal(formatInteger(-5), '0');
    assert.match(formatInteger(100_000), /100.?000/);
  });
});

describe('billing/balance-panel renderBalanceHistoryRows', () => {
  it('renders credit amounts in history rows', async () => {
    mockBrowserStorage();
    const { renderBalanceHistoryRows } = await import('../../webui_src/ts/billing/balance-panel');

    const html = renderBalanceHistoryRows([
      {
        date: Date.UTC(2026, 5, 13),
        title: 'Пополнение',
        spent: 0,
        received: 5.5,
        balance: 5.5,
      },
      {
        date: Date.UTC(2026, 5, 13, 12),
        title: 'Запрос к модели',
        spent: 0.052,
        received: 0,
        balance: 5.448,
      },
    ]);

    assert.match(html, /5,50/);
    assert.doesNotMatch(html, /\$5,50/);
    assert.match(html, /0,052/);
    assert.match(html, /Пополнение/);
    assert.match(html, /balance-history-row/);
  });
});
