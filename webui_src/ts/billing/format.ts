const usdFmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const usdDetailFmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const intFmt = new Intl.NumberFormat('ru-RU');
const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatMoney(value: number, options: { detail?: boolean } = {}): string {
  const n = Number(value) || 0;
  const fmt = options.detail ? usdDetailFmt : usdFmt;
  return fmt.format(n);
}

export function formatMoneyAbs(value: number, options: { detail?: boolean } = {}): string {
  const n = Math.abs(Number(value) || 0);
  if (n <= 0) return '—';
  return formatMoney(n, options);
}

export function formatInteger(value: number): string {
  return intFmt.format(Math.max(0, Number(value) || 0));
}

export function formatOperationDate(timestamp: number): string {
  return dateFmt.format(new Date(Number(timestamp) || Date.now()));
}

export function formatRub(value: number): string {
  return `${intFmt.format(Math.round(Number(value) || 0))} ₽`;
}

/** Парсит ввод суммы с учётом ru-RU (запятая как десятичный разделитель, пробелы как разделитель тысяч). */
export function parseMoneyInput(value: string): number {
  const trimmed = (value || '').trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Форматирует сумму в кредитах (1 кредит = 1 USD по курсу ЦБ при пополнении). */
export function formatCreditsLabel(value: number, options: { detail?: boolean } = {}): string {
  return formatMoney(value, options);
}

/** @deprecated Используйте formatCreditsLabel — символ $ убран из UI. */
export function formatUsdLabel(value: number, options: { detail?: boolean } = {}): string {
  return formatCreditsLabel(value, options);
}
