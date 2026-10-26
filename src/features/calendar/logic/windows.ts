// Расчёт общих окон — чистые функции без обращения к серверу.
//
// Режим «Свободное время»: каждый, кто отметился, свободен только в своих
// интервалах; общий результат — их пересечение. Кто не отметился — свободен всегда.
// Режим «Занятое время»: результат — весь период минус все занятые интервалы.
// Затем вычитается ночь и отбрасываются окна короче минимальной длины.

import { addDays, dateKey, zonedMoment } from './time.ts';

export interface Interval {
  start: number;
  end: number;
}

export type CalendarMode = 'free' | 'busy';

export interface NightRule {
  enabled: boolean;
  night_start: string | null; // 'HH:MM:SS'
  night_end: string | null;
  timezone: string;
  applies_from: string | null; // 'YYYY-MM-DD', null — без ограничения
  applies_to: string | null;
  created_at: string;
}

export interface UserInterval extends Interval {
  user_id: string;
}

// Сортирует и склеивает пересекающиеся и соприкасающиеся интервалы
export function normalize(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const result: Interval[] = [];
  for (const i of sorted) {
    const last = result[result.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else result.push({ start: i.start, end: i.end });
  }
  return result;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const x = normalize(a);
  const y = normalize(b);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const start = Math.max(x[i].start, y[j].start);
    const end = Math.min(x[i].end, y[j].end);
    if (end > start) result.push({ start, end });
    if (x[i].end < y[j].end) i++;
    else j++;
  }
  return result;
}

export function subtract(from: Interval[], remove: Interval[]): Interval[] {
  const cuts = normalize(remove);
  const result: Interval[] = [];
  for (const piece of normalize(from)) {
    let cursor = piece.start;
    for (const cut of cuts) {
      if (cut.end <= cursor || cut.start >= piece.end) continue;
      if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= piece.end) break;
    }
    if (cursor < piece.end) result.push({ start: cursor, end: piece.end });
  }
  return result;
}

// Правило ночи для даты: самое свежее из тех, в чей период дата попадает
export function ruleForDate(rules: NightRule[], key: string): NightRule | null {
  let best: NightRule | null = null;
  for (const r of rules) {
    if (r.applies_from && key < r.applies_from) continue;
    if (r.applies_to && key > r.applies_to) continue;
    if (!best || r.created_at > best.created_at) best = r;
  }
  return best;
}

// Ночные интервалы, задевающие период range.
// Ночь даты D начинается в D (по поясу правила) и, если конец «раньше» начала, заканчивается в D+1.
export function nightIntervals(rules: NightRule[], range: Interval): Interval[] {
  if (rules.length === 0) return [];
  const result: Interval[] = [];
  const last = addDays(dateKey(range.end, 'UTC'), 1);
  for (let key = addDays(dateKey(range.start, 'UTC'), -2); key <= last; key = addDays(key, 1)) {
    const rule = ruleForDate(rules, key);
    if (!rule?.enabled || !rule.night_start || !rule.night_end) continue;
    const endKey = rule.night_end <= rule.night_start ? addDays(key, 1) : key;
    result.push({
      start: zonedMoment(key, rule.night_start, rule.timezone),
      end: zonedMoment(endKey, rule.night_end, rule.timezone),
    });
  }
  return intersect(result, [range]);
}

export function commonWindows(params: {
  mode: CalendarMode;
  range: Interval;
  memberIds: string[];
  slots: UserInterval[];
  nightRules: NightRule[];
  minMinutes: number;
}): Interval[] {
  const { mode, range, memberIds, slots, nightRules, minMinutes } = params;
  const members = new Set(memberIds);
  const ownSlots = slots.filter((s) => members.has(s.user_id));

  let windows: Interval[] = [range];
  if (mode === 'free') {
    for (const id of members) {
      const mine = ownSlots.filter((s) => s.user_id === id);
      if (mine.length > 0) windows = intersect(windows, mine);
    }
  } else {
    windows = subtract(windows, ownSlots);
  }

  windows = subtract(windows, nightIntervals(nightRules, range));
  const minMs = minMinutes * 60 * 1000;
  return windows.filter((w) => w.end - w.start >= minMs);
}

// Окна, которые задевают день key (по поясу timeZone)
export function windowsOnDay(windows: Interval[], key: string, timeZone: string): Interval[] {
  const dayStart = zonedMoment(key, '00:00', timeZone);
  const dayEnd = zonedMoment(addDays(key, 1), '00:00', timeZone);
  return windows.filter((w) => w.start < dayEnd && w.end > dayStart);
}
