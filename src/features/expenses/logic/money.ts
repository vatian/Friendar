// Деньги считаем в копейках (целые числа) — так нет ошибок округления.

// «12», «12,5», «1 200.50» → копейки; null, если введено не число или больше 2 знаков после запятой
export function parseAmount(input: string): number | null {
  const normalized = input.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 && cents < 1e14 ? cents : null;
}

// Делит сумму поровну на n частей; лишние копейки достаются первым
export function splitEvenly(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts);
  const rest = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

const formatters = new Map<string, Intl.NumberFormat>();

// 1234.5 ₽, 10 $, 99,90 ₺
export function formatMoney(cents: number, currency: string): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

// «12.5» — для поля ввода при редактировании
export function centsToInput(cents: number): string {
  return (cents / 100).toString().replace('.', ',');
}

export interface Share {
  expense_id: string;
  payer_id: string;
  debtor_id: string;
  currency: string;
  amount: number; // в валюте, например 300.5
  title: string;
  spent_on: string; // 'YYYY-MM-DD'
  created_at: string;
}

export const toCents = (amount: number) => Math.round(amount * 100);

// Итоги с каждым человеком по каждой валюте: плюс — он должен мне, минус — я ему.
// Нулевые итоги не попадают в результат.
export function balances(shares: Share[], me: string): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const s of shares) {
    let other: string;
    let sign: number;
    if (s.payer_id === me) {
      other = s.debtor_id;
      sign = 1;
    } else if (s.debtor_id === me) {
      other = s.payer_id;
      sign = -1;
    } else continue;
    const byCurrency = result.get(other) ?? new Map<string, number>();
    byCurrency.set(s.currency, (byCurrency.get(s.currency) ?? 0) + sign * toCents(s.amount));
    result.set(other, byCurrency);
  }
  for (const [other, byCurrency] of result) {
    for (const [currency, cents] of byCurrency) if (cents === 0) byCurrency.delete(currency);
    if (byCurrency.size === 0) result.delete(other);
  }
  return result;
}

export interface HistoryEntry {
  expense_id: string;
  title: string;
  spent_on: string;
  currency: string;
  cents: number;
  paidByMe: boolean; // true — я платил, он должен мне; false — он платил, я должен
}

// История трат между мной и other, новые сверху
export function historyWith(shares: Share[], me: string, other: string): HistoryEntry[] {
  return shares
    .filter(
      (s) =>
        (s.payer_id === me && s.debtor_id === other) || (s.payer_id === other && s.debtor_id === me),
    )
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at))
    .map((s) => ({
      expense_id: s.expense_id,
      title: s.title,
      spent_on: s.spent_on,
      currency: s.currency,
      cents: toCents(s.amount),
      paidByMe: s.payer_id === me,
    }));
}
