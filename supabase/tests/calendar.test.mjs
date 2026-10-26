// Правила функции «Календарь»: создание, отметки, права, ночь, выход участника.
import { createChecker, createTestDb, U } from './db.mjs';

const { db, as } = await createTestDb();
const { check, finish } = createChecker();
let r;

// Группа: владелец 1, участники 2 и 3. Пользователь 4 — посторонний.
const g = (await as(1, `select public.create_group('Друзья') as id`)).rows[0].id;
const code = (await as(1, `select public.get_invite_code('${g}') as c`)).rows[0].c;
await as(2, `select public.join_group('${code}')`);
await as(3, `select public.join_group('${code}')`);

r = await as(2, `select public.create_calendar('${g}', 'free')`);
check('участник не создаёт календарь', r.error?.includes('NOT_OWNER'), r);
r = await as(1, `select public.create_calendar('${g}', 'free') as id`);
const cal = r.rows?.[0]?.id;
check('владелец создаёт календарь', !!cal, r);
r = await as(1, `select public.create_calendar('${g}', 'busy')`);
check('второй календарь в группе нельзя', r.error?.includes('CALENDAR_EXISTS'), r);
r = await as(2, `select mode, min_window_minutes, ends_on::text from public.calendars`);
check(
  'участник видит календарь: режим, 2 часа, до 2030',
  r.rows?.[0]?.mode === 'free' && r.rows[0].min_window_minutes === 120 && r.rows[0].ends_on === '2030-12-31',
  r,
);
r = await as(4, `select id from public.calendars`);
check('посторонний не видит календарь', r.rows?.length === 0, r);

const slot = (n, from, to, tz = 'Europe/Moscow') =>
  as(n, `insert into public.calendar_slots (calendar_id, starts_at, ends_at, timezone)
         values ('${cal}', '${from}', '${to}', '${tz}') returning id, user_id`);

r = await slot(2, '2027-01-10 15:00+03', '2027-01-10 20:00+03');
const s2 = r.rows?.[0]?.id;
check('участник добавляет свою отметку', r.rows?.[0]?.user_id === U(2), r);
r = await as(2, `insert into public.calendar_slots (calendar_id, user_id, starts_at, ends_at, timezone)
                 values ('${cal}', '${U(3)}', '2027-01-10 15:00+03', '2027-01-10 16:00+03', 'UTC')`);
check('отметку за другого не добавить', /permission denied/.test(r.error), r);
r = await slot(4, '2027-01-10 15:00+03', '2027-01-10 16:00+03');
check('посторонний не добавляет отметку', !!r.error, r);
r = await slot(2, '2027-01-10 20:00+03', '2027-01-10 19:00+03');
check('конец раньше начала — нельзя', !!r.error, r);
r = await slot(2, '2027-01-10 10:00+03', '2027-01-10 11:00+03', 'Mars/Base');
check('неверный часовой пояс — нельзя', !!r.error, r);

r = await as(3, `select id from public.calendar_slots`);
check('участник видит отметки других', r.rows?.length === 1, r);
r = await as(4, `select id from public.calendar_slots`);
check('посторонний не видит отметки', r.rows?.length === 0, r);
r = await as(3, `update public.calendar_slots set ends_at = '2027-01-10 23:00+03' where id = '${s2}' returning id`);
check('чужую отметку не изменить', r.rows?.length === 0, r);
r = await as(3, `delete from public.calendar_slots where id = '${s2}' returning id`);
check('чужую отметку не удалить', r.rows?.length === 0, r);
r = await as(2, `update public.calendar_slots set ends_at = '2027-01-10 21:00+03', timezone = 'Asia/Yekaterinburg'
                 where id = '${s2}' returning timezone`);
check('свою отметку можно изменить', r.rows?.[0]?.timezone === 'Asia/Yekaterinburg', r);

// Настройки — только владелец
r = await as(2, `select public.set_min_window('${cal}', 180)`);
check('участник не меняет мин. длину', r.error?.includes('NOT_OWNER'), r);
r = await as(1, `select public.set_min_window('${cal}', 45)`);
check('мин. длина кратна 30 минутам', !!r.error, r);
r = await as(1, `select public.set_min_window('${cal}', 180)`);
check('владелец меняет мин. длину', !r.error, r);

await db.exec(`update public.profiles set timezone = 'Asia/Yekaterinburg' where id = '${U(1)}'`);
r = await as(2, `select public.add_night_rule('${cal}', true, '23:00', '07:00', null, null)`);
check('участник не задаёт ночь', r.error?.includes('NOT_OWNER'), r);
r = await as(1, `select public.add_night_rule('${cal}', true, '23:00', '07:00', null, null) as id`);
check('владелец задаёт ночь', !!r.rows?.[0]?.id, r);
r = await as(1, `select public.add_night_rule('${cal}', true, '23:00', '23:00', null, null)`);
check('ночь нулевой длины — нельзя', !!r.error, r);
r = await as(1, `select public.add_night_rule('${cal}', false, null, null, '2027-02-01', '2027-01-01')`);
check('период «с» позже «по» — нельзя', !!r.error, r);
r = await as(3, `select timezone, night_start::text from public.calendar_night_rules`);
check(
  'ночь записана в поясе владельца и видна участникам',
  r.rows?.[0]?.timezone === 'Asia/Yekaterinburg' && r.rows[0].night_start === '23:00:00',
  r,
);

// Смена режима удаляет отметки
r = await as(2, `select public.set_calendar_mode('${cal}', 'busy')`);
check('участник не меняет режим', r.error?.includes('NOT_OWNER'), r);
await as(1, `select public.set_calendar_mode('${cal}', 'free')`);
r = await as(1, `select count(*)::int as n from public.calendar_slots`);
check('тот же режим — отметки на месте', r.rows?.[0]?.n === 1, r);
await as(1, `select public.set_calendar_mode('${cal}', 'busy')`);
r = await as(1, `select mode, (select count(*)::int from public.calendar_slots) as n from public.calendars`);
check('смена режима удаляет отметки', r.rows?.[0]?.mode === 'busy' && r.rows[0].n === 0, r);

// Ушёл из группы — отметки удалены
await slot(2, '2027-01-11 10:00+03', '2027-01-11 12:00+03');
await slot(3, '2027-01-11 10:00+03', '2027-01-11 12:00+03');
await as(3, `select public.leave_group('${g}')`);
r = await as(2, `select user_id from public.calendar_slots`);
check('отметки ушедшего удалены, остальные на месте', r.rows?.length === 1 && r.rows[0].user_id === U(2), r);

// Группа удалена — календарь удалён
await as(2, `select public.leave_group('${g}')`);
await as(1, `select public.leave_group('${g}')`);
await db.exec('reset role;');
r = await db.query(`select (select count(*)::int from public.calendars) as c,
                           (select count(*)::int from public.calendar_slots) as s,
                           (select count(*)::int from public.calendar_night_rules) as n`);
check('группа удалена — календарь, отметки и ночь тоже', r.rows[0].c + r.rows[0].s + r.rows[0].n === 0, r.rows);

finish();
