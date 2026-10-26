// Премиум: промокод, лимиты, своё имя, имена в группе, цвет группы.
import { createChecker, createTestDb, U } from './db.mjs';

const { db, as } = await createTestDb(20);
const { check, finish } = createChecker();
let r;

// Тестовый код вносится в базу так же, как настоящий: только хеш
await db.exec(`insert into public.promo_codes (code_hash)
               values (encode(sha256(convert_to('TESTCODE', 'UTF8')), 'hex'))`);

// ---------- Промокод ----------
r = await as(1, `select public.redeem_promo('WRONG') as ok`);
check('неверный код — false', r.rows?.[0]?.ok === false, r);
r = await as(1, `select premium_since from public.profiles where id = '${U(1)}'`);
check('после неверного кода премиума нет', r.rows?.[0]?.premium_since === null, r);
r = await as(1, `select public.redeem_promo('  testcode ') as ok`);
check('верный код (регистр и пробелы не важны) — true', r.rows?.[0]?.ok === true, r);
r = await as(1, `select premium_since is not null as p from public.profiles where id = '${U(1)}'`);
check('премиум активирован', r.rows?.[0]?.p === true, r);
r = await as(2, `select public.redeem_promo('TESTCODE') as ok`);
check('код многоразовый — второй человек тоже получает премиум', r.rows?.[0]?.ok === true, r);

for (let i = 0; i < 5; i++) await as(3, `select public.redeem_promo('WRONG${i}')`);
r = await as(3, `select public.redeem_promo('TESTCODE')`);
check('после 5 попыток за 10 минут — пауза', r.error?.includes('TOO_MANY_ATTEMPTS'), r);

r = await as(4, `update public.profiles set premium_since = now() where id = '${U(4)}'`);
check('премиум нельзя поставить себе вручную', /permission denied/.test(r.error), r);
r = await as(4, `select * from public.promo_codes`);
check('таблица промокодов закрыта', /permission denied/.test(r.error), r);
r = await as(1, `select public.is_premium('${U(4)}') as p`);
check('у 4 премиума нет', r.rows?.[0]?.p === false, r);

// ---------- Лимит групп: премиум 10, обычный 2 ----------
const groupsOf1 = [];
for (let i = 0; i < 10; i++) {
  r = await as(1, `select public.create_group('Г${i}') as id`);
  if (r.rows?.[0]?.id) groupsOf1.push(r.rows[0].id);
}
check('премиум состоит в 10 группах', groupsOf1.length === 10, groupsOf1.length);
r = await as(1, `select public.create_group('Лишняя')`);
check('11-я группа — нельзя', r.error?.includes('TOO_MANY_GROUPS'), r);
await as(4, `select public.create_group('А')`);
await as(4, `select public.create_group('Б')`);
r = await as(4, `select public.create_group('В')`);
check('без премиума — по-прежнему 2 группы', r.error?.includes('TOO_MANY_GROUPS'), r);

// ---------- Вместимость группы: по премиуму владельца ----------
const big = groupsOf1[0];
const bigCode = (await as(1, `select public.get_invite_code('${big}') as c`)).rows[0].c;
let joined = 1;
for (let n = 5; n <= 19; n++) {
  r = await as(n, `select public.join_group('${bigCode}')`);
  if (!r.error) joined++;
}
check('у премиум-владельца в группе 15 участников', joined === 15, joined);
r = await as(20, `select public.join_group('${bigCode}')`);
check('16-й не вступит', r.error?.includes('GROUP_FULL'), r);

const small = (await as(4, `select id from public.groups where owner_id = '${U(4)}' limit 1`)).rows[0].id;
const smallCode = (await as(4, `select public.get_invite_code('${small}') as c`)).rows[0].c;
// В группу обычного владельца вступают премиум-участники — лимит всё равно 6
await as(2, `select public.join_group('${smallCode}')`);
for (const n of [5, 6, 7, 8]) await as(n, `select public.join_group('${smallCode}')`);
r = await as(9, `select public.join_group('${smallCode}')`);
check('у обычного владельца — 6, даже если участники с премиумом', r.error?.includes('GROUP_FULL'), r);

// ---------- Своё имя ----------
r = await as(4, `select public.set_my_name('Котик')`);
check('без премиума своё имя не задать', r.error?.includes('NOT_PREMIUM'), r);
r = await as(1, `select public.set_my_name('  Анна Б.  ')`);
r = await as(5, `select custom_name from public.profiles where id = '${U(1)}'`);
check('своё имя видят участники общих групп', r.rows?.[0]?.custom_name === 'Анна Б.', r);
r = await as(1, `select public.set_my_name('${'я'.repeat(33)}')`);
check('имя длиннее 32 символов — нельзя', !!r.error, r);
await as(1, `select public.set_my_name(null)`);
r = await as(1, `select custom_name from public.profiles where id = '${U(1)}'`);
check('сброс имени — снова ник', r.rows?.[0]?.custom_name === null, r);

// ---------- Имена участников в группе ----------
r = await as(1, `select public.set_member_name('${big}', '${U(5)}', 'Лучший друг')`);
check('премиум-владелец переименовывает участника', !r.error, r);
r = await as(6, `select name from public.group_member_names where group_id = '${big}' and user_id = '${U(5)}'`);
check('имя видят участники этой группы', r.rows?.[0]?.name === 'Лучший друг', r);
r = await as(2, `select name from public.group_member_names where user_id = '${U(5)}' and group_id <> '${big}'`);
check('в другой группе имя не действует', r.rows?.length === 0, r);
r = await as(4, `select name from public.group_member_names where group_id = '${big}'`);
check('посторонний не видит имена группы', r.rows?.length === 0, r);
r = await as(5, `select public.set_member_name('${big}', '${U(6)}', 'Хм')`);
check('участник (не владелец) не переименовывает', r.error?.includes('NOT_OWNER'), r);
r = await as(4, `select public.set_member_name('${small}', '${U(5)}', 'Хм')`);
check('владелец без премиума не переименовывает', r.error?.includes('NOT_PREMIUM'), r);
r = await as(1, `select public.set_member_name('${big}', '${U(20)}', 'Чужой')`);
check('не-участника не переименовать', !!r.error, r);
r = await as(5, `insert into public.group_member_names values ('${big}', '${U(5)}', 'Сам')`);
check('напрямую имя не записать', /permission denied/.test(r.error), r);
await as(5, `select public.leave_group('${big}')`);
await as(5, `select public.join_group('${bigCode}')`);
r = await as(1, `select name from public.group_member_names where user_id = '${U(5)}'`);
check('вышел и вернулся — имя от владельца сброшено', r.rows?.length === 0, r);

// ---------- Цвет кнопок ----------
r = await as(1, `select public.set_group_color('${big}', '#7b5cd6')`);
r = await as(6, `select accent_color from public.groups where id = '${big}'`);
check('премиум-владелец задаёт цвет, участники его видят', r.rows?.[0]?.accent_color === '#7b5cd6', r);
r = await as(1, `select public.set_group_color('${big}', '#123456')`);
check('цвет только из готовых', !!r.error, r);
r = await as(4, `select public.set_group_color('${small}', '#7b5cd6')`);
check('без премиума цвет не задать', r.error?.includes('NOT_PREMIUM'), r);
r = await as(6, `select public.set_group_color('${big}', null)`);
check('участник не меняет цвет', r.error?.includes('NOT_OWNER'), r);

// ---------- Премиум-владелец ушёл ----------
await as(1, `select public.leave_group('${big}')`);
r = await as(5, `select owner_id, accent_color, (select count(*)::int from public.group_members where group_id = '${big}') as n
                 from public.groups where id = '${big}'`);
check('права перешли, никого не выгнали, цвет сохранился',
  r.rows?.[0]?.n === 14 && r.rows[0].accent_color === '#7b5cd6' && r.rows[0].owner_id !== U(1), r);
r = await as(20, `select public.join_group('${bigCode}')`);
check('при обычном владельце и 14 участниках новые не вступают', r.error?.includes('GROUP_FULL'), r);

finish();
