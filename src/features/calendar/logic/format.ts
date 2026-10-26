// Подписи дат и интервалов по-русски.
import { dateKey, formatTime, parseDateKey } from './time.ts';
import type { Interval } from './windows.ts';

const utcDate = (key: string) => {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day));
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// «Январь 2027»
export function monthTitle(year: number, month: number): string {
  const name = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return `${capitalize(name)} ${year}`;
}

// «Пн, 10 января»
export function dayTitle(key: string): string {
  return capitalize(
    new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(utcDate(key)),
  );
}

// «10 янв»
export function shortDate(key: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(utcDate(key))
    .replace('.', '');
}

// «18:00 – 20:00»; если начало или конец в другой день, чем dayKey, — с датой
export function rangeLabel(interval: Interval, dayKey: string, timeZone: string): string {
  const part = (ms: number) => {
    const key = dateKey(ms, timeZone);
    const time = formatTime(ms, timeZone);
    return key === dayKey ? time : `${shortDate(key)} ${time}`;
  };
  return `${part(interval.start)} – ${part(interval.end)}`;
}
