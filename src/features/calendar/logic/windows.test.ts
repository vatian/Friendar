// Проверки расчёта общих окон и часовых поясов. Запуск: npm run test:calendar
import { addDays, dateKey, formatTime, fromZoned, zonedMoment } from './time.ts';
import { commonWindows, nightIntervals, type Interval, type NightRule } from './windows.ts';

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  console.log(cond ? 'OK   ' : 'FAIL ', name, cond ? '' : JSON.stringify(got));
  if (!cond) failed++;
}

const MSK = 'Europe/Moscow';
const EKB = 'Asia/Yekaterinburg';
const at = (key: string, time: string, tz = MSK) => zonedMoment(key, time, tz);
// Окна в виде «10.01 17:00–10.01 20:00» по Москве — чтобы легко сравнивать
const show = (list: Interval[], tz = MSK) =>
  list.map(
    (w) =>
      `${dateKey(w.start, tz).slice(8)}.${dateKey(w.start, tz).slice(5, 7)} ${formatTime(w.start, tz)}–` +
      `${dateKey(w.end, tz).slice(8)}.${dateKey(w.end, tz).slice(5, 7)} ${formatTime(w.end, tz)}`,
  );
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Часовые пояса ----------
check('Москва: 18:00 = 15:00 UTC', fromZoned(2027, 1, 10, 18, 0, MSK) === Date.UTC(2027, 0, 10, 15, 0));
check('Екатеринбург: 18:00 = 13:00 UTC', fromZoned(2027, 1, 10, 18, 0, EKB) === Date.UTC(2027, 0, 10, 13, 0));
const ny = 'America/New_York';
check('Нью-Йорк зимой UTC−5', fromZoned(2027, 1, 10, 12, 0, ny) === Date.UTC(2027, 0, 10, 17, 0));
check('Нью-Йорк летом UTC−4', fromZoned(2027, 7, 10, 12, 0, ny) === Date.UTC(2027, 6, 10, 16, 0));
check(
  'одна отметка в разных поясах: 18:00 ЕКБ = 16:00 МСК',
  formatTime(at('2027-01-10', '18:00', EKB), MSK) === '16:00',
);
check('переход через месяц', addDays('2027-01-31', 1) === '2027-02-01');
check('високосный год', addDays('2028-02-28', 1) === '2028-02-29');

// ---------- Режим «Свободное время» ----------
const day = { start: at('2027-01-10', '00:00'), end: at('2027-01-12', '00:00') };
const slot = (user_id: string, key: string, from: string, to: string, toKey = key) => ({
  user_id,
  start: at(key, from),
  end: at(toKey, to),
});
const base = { range: day, memberIds: ['A', 'B', 'C'], nightRules: [] as NightRule[], minMinutes: 120 };

let w = commonWindows({
  ...base,
  mode: 'free',
  slots: [slot('A', '2027-01-10', '15:00', '20:00'), slot('B', '2027-01-10', '17:00', '22:00')],
});
check('свободны все: пересечение 17–20, неотметившийся C не мешает', same(show(w), ['10.01 17:00–10.01 20:00']), show(w));

w = commonWindows({
  ...base,
  mode: 'free',
  slots: [slot('A', '2027-01-10', '15:00', '18:00'), slot('B', '2027-01-10', '17:00', '22:00')],
});
check('окно 1 ч короче минимума 2 ч — отброшено', w.length === 0, show(w));
w = commonWindows({
  ...base,
  minMinutes: 60,
  mode: 'free',
  slots: [slot('A', '2027-01-10', '15:00', '18:00'), slot('B', '2027-01-10', '17:00', '22:00')],
});
check('при минимуме 1 ч окно 17–18 остаётся', same(show(w), ['10.01 17:00–10.01 18:00']), show(w));

w = commonWindows({
  ...base,
  mode: 'free',
  slots: [
    slot('A', '2027-01-10', '10:00', '12:00'),
    slot('A', '2027-01-10', '11:00', '14:00'),
    slot('B', '2027-01-10', '10:00', '14:00'),
  ],
});
check('свои пересекающиеся отметки склеиваются', same(show(w), ['10.01 10:00–10.01 14:00']), show(w));

w = commonWindows({
  ...base,
  memberIds: ['A', 'B'],
  mode: 'free',
  slots: [slot('A', '2027-01-10', '10:00', '14:00'), slot('X', '2027-01-10', '12:00', '13:00')],
});
check('отметки не-участника (ушёл) не учитываются', same(show(w), ['10.01 10:00–10.01 14:00']), show(w));

w = commonWindows({
  ...base,
  mode: 'free',
  slots: [slot('A', '2027-01-10', '10:00', '12:00'), slot('B', '2027-01-10', '13:00', '15:00')],
});
check('нет общего времени — пусто', w.length === 0, show(w));

// ---------- Режим «Занятое время» ----------
const workday = { start: at('2027-01-10', '09:00'), end: at('2027-01-10', '18:00') };
w = commonWindows({
  ...base,
  range: workday,
  mode: 'busy',
  slots: [slot('A', '2027-01-10', '10:00', '12:00'), slot('B', '2027-01-10', '11:00', '15:00')],
});
check('заняты: свободно 15–18, окно 9–10 короче 2 ч', same(show(w), ['10.01 15:00–10.01 18:00']), show(w));
w = commonWindows({ ...base, range: workday, mode: 'busy', slots: [] });
check('никто не отметился — свободен весь период', same(show(w), ['10.01 09:00–10.01 18:00']), show(w));

// ---------- Ночь ----------
const rule = (r: Partial<NightRule>): NightRule => ({
  enabled: true,
  night_start: '23:00:00',
  night_end: '07:00:00',
  timezone: MSK,
  applies_from: null,
  applies_to: null,
  created_at: '2027-01-01T00:00:00+00:00',
  ...r,
});

w = commonWindows({
  ...base,
  mode: 'free',
  nightRules: [rule({})],
  slots: [slot('A', '2027-01-10', '20:00', '10:00', '2027-01-11')],
});
check(
  'ночь 23–07 вырезана из окна 20:00–10:00',
  same(show(w), ['10.01 20:00–10.01 23:00', '11.01 07:00–11.01 10:00']),
  show(w),
);

w = commonWindows({
  ...base,
  mode: 'free',
  nightRules: [
    rule({}),
    rule({ enabled: false, night_start: null, night_end: null, applies_from: '2027-01-10', applies_to: '2027-01-10', created_at: '2027-01-02T00:00:00+00:00' }),
  ],
  slots: [slot('A', '2027-01-10', '20:00', '10:00', '2027-01-11')],
});
check('более свежее правило «без ночи» на 10.01 отменяет ночь', same(show(w), ['10.01 20:00–11.01 10:00']), show(w));

const nightsEkb = nightIntervals([rule({ timezone: EKB })], { start: at('2027-01-10', '12:00'), end: at('2027-01-11', '12:00') });
check(
  'ночь 23–07 по Екатеринбургу = 21–05 по Москве',
  same(show(nightsEkb), ['10.01 21:00–11.01 05:00']),
  show(nightsEkb),
);

const nightsNoWrap = nightIntervals([rule({ night_start: '00:30:00', night_end: '06:00:00' })], {
  start: at('2027-01-10', '00:00'),
  end: at('2027-01-11', '00:00'),
});
check('ночь без перехода через полночь (00:30–06:00)', same(show(nightsNoWrap), ['10.01 00:30–10.01 06:00']), show(nightsNoWrap));

const periodRule = nightIntervals(
  [rule({ applies_from: '2027-01-11', applies_to: '2027-01-11' })],
  { start: at('2027-01-10', '00:00'), end: at('2027-01-13', '00:00') },
);
check('правило на период действует только в свои даты', same(show(periodRule), ['11.01 23:00–12.01 07:00']), show(periodRule));

console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
