// Работа с часовыми поясами без сторонних библиотек (через встроенный Intl).
// Все моменты времени — миллисекунды UTC; «дата» — строка 'YYYY-MM-DD'
// в каком-то часовом поясе.

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

// Что показывают часы в поясе timeZone в момент ms
export function toZoned(ms: number, timeZone: string): ZonedParts {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour % 24,
    minute: p.minute,
    second: p.second,
  };
}

function offsetMs(ms: number, timeZone: string): number {
  const z = toZoned(ms, timeZone);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Момент, когда часы в поясе timeZone показывают указанные дату и время
export function fromZoned(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  // Повторная проверка нужна около перевода часов (летнее/зимнее время)
  const second = guess - offsetMs(first, timeZone);
  return second;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(ms: number, timeZone: string): string {
  const z = toZoned(ms, timeZone);
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

export function addDays(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// 'HH:MM' или 'HH:MM:SS' → часы и минуты
export function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

// Момент: дата key, время 'HH:MM' в поясе timeZone
export function zonedMoment(key: string, time: string, timeZone: string): number {
  const { year, month, day } = parseDateKey(key);
  const { hour, minute } = parseTime(time);
  return fromZoned(year, month, day, hour, minute, timeZone);
}

export function startOfDay(key: string, timeZone: string): number {
  return zonedMoment(key, '00:00', timeZone);
}

export function todayKey(timeZone: string): string {
  return dateKey(Date.now(), timeZone);
}

export function formatTime(ms: number, timeZone: string): string {
  const z = toZoned(ms, timeZone);
  return `${pad(z.hour)}:${pad(z.minute)}`;
}

// Длительность «2 ч 30 мин»
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  return h ? `${h} ч` : `${m} мин`;
}
