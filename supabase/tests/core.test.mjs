// Правила ядра: группы, участники, лимиты, права доступа.
import { createChecker, createTestDb, U } from './db.mjs';

const { db, as } = await createTestDb();
const { check, finish } = createChecker();

const g1 = (await as(1, `select public.create_group('Друзья') as id`)).rows[0].id;
check('создание группы', !!g1);
const code = (await as(1, `select public.get_invite_code('${g1}') as c`)).rows[0].c;
check('владелец видит код', code?.length === 12, code);

for (let i = 2; i <= 6; i++) {
  const r = await as(i, `select public.join_group('${code}') as id`);
  check(`вступление участника ${i}`, r.rows?.[0]?.id === g1, r);
}
let r = await as(7, `select public.join_group('${code}')`);
check('седьмой не может вступить', r.error?.includes('GROUP_FULL'), r);
r = await as(2, `select public.join_group('${code}') as id`);
check('повторное вступление не ломается', r.rows?.[0]?.id === g1, r);
r = await as(7, `select public.join_group('nope')`);
check('неверный код', r.error?.includes('INVALID_INVITE'), r);

r = await as(2, `select public.create_group('Вторая') as id`);
const g2 = r.rows?.[0]?.id;
check('вторая группа у участника 2', !!g2, r);
r = await as(2, `select public.create_group('Третья')`);
check('третья группа запрещена', r.error?.includes('TOO_MANY_GROUPS'), r);
r = await as(2, `select count(*)::int as n from public.groups where name = 'Третья'`);
check('третья группа не осталась в базе', r.rows?.[0]?.n === 0, r);

r = await as(7, `select id, name, owner_id from public.groups`);
check('чужой не видит группы', r.rows?.length === 0, r);
r = await as(7, `select * from public.group_members`);
check('чужой не видит участников', r.rows?.length === 0, r);
r = await as(7, `select id from public.profiles`);
check('чужой видит только свой профиль', r.rows?.length === 1, r);
r = await as(3, `select id from public.profiles`);
check('участник видит профили своей группы', r.rows?.length === 6, r);
r = await as(3, `select invite_code from public.groups`);
check('код приглашения не читается напрямую', /permission denied/.test(r.error), r);
r = await as(3, `select id, name, owner_id from public.groups`);
check('участник видит свою группу', r.rows?.length === 1, r);
r = await as(1, `select id from public.groups order by name`);
check('владелец видит только свою группу', r.rows?.length === 1, r);
r = await as(2, `select public.get_invite_code('${g1}')`);
check('не-владелец не видит код', r.error?.includes('NOT_OWNER'), r);
r = await as(2, `select public.remove_member('${g1}', '${U(3)}')`);
check('не-владелец не удаляет участников', r.error?.includes('NOT_OWNER'), r);
r = await as(3, `insert into public.group_members values ('${g1}', '${U(7)}')`);
check('напрямую вставить участника нельзя', /permission denied/.test(r.error), r);
r = await as(3, `delete from public.group_members where user_id = '${U(4)}'`);
check('напрямую удалить участника нельзя', /permission denied/.test(r.error), r);
r = await as(null, `select public.create_group('anon')`);
check('без входа группу не создать', !!r.error, r);

r = await as(3, `update public.profiles set timezone = 'Asia/Yekaterinburg' where id = '${U(3)}' returning timezone`);
check('свой часовой пояс меняется', r.rows?.[0]?.timezone === 'Asia/Yekaterinburg', r);
r = await as(3, `update public.profiles set timezone = 'Mars/Olympus' where id = '${U(3)}'`);
check('неверный пояс отклонён', !!r.error, r);
r = await as(3, `update public.profiles set timezone = 'UTC' where id = '${U(4)}' returning id`);
check('чужой профиль не меняется', r.rows?.length === 0, r);
r = await as(3, `update public.profiles set first_name = 'Hacker' where id = '${U(3)}'`);
check('имя вручную не меняется', /permission denied/.test(r.error), r);

r = await as(1, `select public.remove_member('${g1}', '${U(6)}')`);
check('владелец удаляет участника', !r.error, r);
r = await as(7, `select public.join_group('${code}') as id`);
check('после удаления освободилось место', r.rows?.[0]?.id === g1, r);
const newCode = (await as(1, `select public.regenerate_invite_code('${g1}') as c`)).rows[0].c;
r = await as(8, `select public.join_group('${code}')`);
check('старый код больше не работает', r.error?.includes('INVALID_INVITE'), r);
check('новый код другой', newCode && newCode !== code, newCode);

r = await as(1, `select public.leave_group('${g1}')`);
r = await as(2, `select owner_id from public.groups where id = '${g1}'`);
check('владелец ушёл — права у следующего (2)', r.rows?.[0]?.owner_id === U(2), r);
r = await as(1, `select id from public.groups where id = '${g1}'`);
check('ушедший больше не видит группу', r.rows?.length === 0, r);

for (const n of [2, 3, 4, 5, 7]) await as(n, `select public.leave_group('${g1}')`);
await db.exec('reset role;');
r = await db.query(`select count(*)::int as n from public.groups where id = '${g1}'`);
check('последний вышел — группа удалена', r.rows[0].n === 0, r.rows);

// Удаление аккаунта (делает администратор Supabase): владелец группы g2 — участник 2.
const code2 = (await as(2, `select public.get_invite_code('${g2}') as c`)).rows[0].c;
await as(3, `select public.join_group('${code2}')`);
await db.exec('reset role;');
r = await db.query(`delete from auth.users where id = '${U(2)}'`).catch((e) => ({ error: e.message }));
check('удаление аккаунта владельца проходит', !r.error, r);
r = await db.query(`select owner_id from public.groups where id = '${g2}'`);
check('после удаления владельца права у следующего (3)', r.rows[0]?.owner_id === U(3), r.rows);
r = await db.query(`delete from auth.users where id = '${U(3)}'`).catch((e) => ({ error: e.message }));
r = await db.query(`select count(*)::int as n from public.groups where id = '${g2}'`);
check('удалён последний участник — группа удалена', r.rows[0].n === 0, r.rows);

finish();
