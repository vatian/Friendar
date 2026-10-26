import { useMemo } from 'react';
import { currencyOptions } from '../logic/currencies.ts';

export function CurrencySelect(props: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const { popular, others } = useMemo(currencyOptions, []);
  return (
    <select
      className="input"
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <optgroup label="Частые">
        {popular.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Все валюты">
        {others.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
