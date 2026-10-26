// Список валют: частые сверху, дальше все остальные по алфавиту кода.
const POPULAR = ['RUB', 'USD', 'EUR', 'TRY', 'KZT', 'GEL', 'AMD', 'BYN', 'UZS', 'KGS', 'AED', 'THB', 'CNY', 'GBP', 'RSD'];

export interface CurrencyOption {
  code: string;
  label: string;
}

function currencySymbol(code: string): string {
  const part = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? code;
}

let cached: { popular: CurrencyOption[]; others: CurrencyOption[] } | null = null;

export function currencyOptions(): { popular: CurrencyOption[]; others: CurrencyOption[] } {
  if (cached) return cached;
  const names = new Intl.DisplayNames('ru', { type: 'currency' });
  const option = (code: string): CurrencyOption => {
    const symbol = currencySymbol(code);
    const name = names.of(code) ?? code;
    return { code, label: symbol === code ? `${code} — ${name}` : `${symbol} ${code} — ${name}` };
  };
  const all = Intl.supportedValuesOf('currency');
  cached = {
    popular: POPULAR.filter((c) => all.includes(c)).map(option),
    others: all.filter((c) => !POPULAR.includes(c)).map(option),
  };
  return cached;
}
