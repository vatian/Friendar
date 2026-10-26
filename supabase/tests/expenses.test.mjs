// Правила функции «Траты»: запись трат, приватность, права, запрет выхода с долгами.
import { createChecker, createTestDb, U } from './db.mjs';

const { db, as } = await createTestDb();
const { check, finish } = createChecker();
let r;

// Группа: владелец 1 (А), участники 2 (Б) и 3 (В). Пользователь 4 — посторонний.
const g = (await as(1, `select public.create_group('Друзья') as id`)).rows[0].id;
const code = (await as(1, `select public.get_invite_code('${g}') as c`)).rows[0].c;
await as(2, `select public.join_group('${code}')`);
await as(3, `select public.join_group('${code}')`);

const shares = (list) => `'${JSON.stringify(list.map(([n, amount]) => ({ debtor_id: U(n), amount })))}'::jsonb`;
const create = (n, title, currency, list, group = g) =>
  as(n, `select public.create_expense('${group}', '${title}', '${currency}', '2027-03-01', ${shares(list)}) as id`);

// А заплатил за ужин: Б и В должны по 300 ₽
r = await create(1, 'Ужин', 'RUB', [[2, 300], [3, 300]]);
const dinner = r.rows?.[0]?.id;
check('участник записывает трату', !!dinner, r);
// Б: «А должен мне 50 ₽» (например, вернул долг или заплатил за А)
r = await create(2, 'Такси', 'RUB', [[1, 50]]);
check('другой участник записывает свою трату', !!r.rows?.[0]?.id, r);
// В в долларах: А должен В 10 $
r = await create(3, 'Кофе', 'USD', [[1, 10]]);
const coffee = r.rows?.[0]?.id;
check('трата в другой валюте', !!coffee, r);

r = await create(1, 'Себе', 'RUB', [[1, 100]]);
check('нельзя записать долг самому себе', !!r.error, r);
r = await create(1, 'Чужой', 'RUB', [[4, 100]]);
check('нельзя записать долг не-участнику', r.error?.includes('INVALID_SHARES'), r);
r = await create(1, 'Ноль', 'RUB', [[2, 0]]);
check('сумма должна быть больше нуля', !!r.error, r);
r = await create(1, 'Пусто', 'RUB', []);
check('нужна хотя бы одна доля', r.error?.includes('INVALID_SHARES'), r);
r = await create(1, 'Валюта', 'рубли', [[2, 10]]);
check('валюта — код из трёх латинских букв', !!r.error, r);
r = await create(4, 'Посторонний', 'RUB', [[1, 10]]);
check('посторонний не записывает трату', r.error?.includes('NOT_MEMBER'), r);
r = await as(1, `select count(*)::int as n from public.expenses`);
check('неудачные траты не остались в базе', r.rows?.[0]?.n === 3, r);
r = await as(2, `insert into public.expense_shares (expense_id, group_id, payer_id, debtor_id, currency, amount)
                 values ('${dinner}', '${g}', '${U(2)}', '${U(3)}', 'RUB', 1)`);
check('напрямую в таблицу долей не записать', /permission denied/.test(r.error), r);

// Приватность
r = await as(2, `select debtor_id, amount::float from public.expense_shares where expense_id = '${dinner}'`);
check('Б видит в ужине только свою долю', r.rows?.length === 1 && r.rows[0].debtor_id === U(2), r);
r = await as(2, `select payer_id, debtor_id from public.expense_shares where payer_id = '${U(3)}' or debtor_id = '${U(3)}'`);
check('Б не видит долги между А и В', r.rows?.length === 0, r);
r = await as(2, `select title from public.expenses where id = '${coffee}'`);
check('Б не видит трату В за кофе для А', r.rows?.length === 0, r);
r = await as(1, `select count(*)::int as n from public.expense_shares`);
check('А видит все свои доли (4)', r.rows?.[0]?.n === 4, r);
r = await as(4, `select id from public.expenses`);
check('посторонний не видит трат', r.rows?.length === 0, r);

// Изменение и удаление — только автор
r = await as(2, `select public.update_expense('${dinner}', 'Взлом', 'RUB', '2027-03-01', ${shares([[3, 1]])})`);
check('чужую трату не изменить', r.error?.includes('NOT_AUTHOR'), r);
r = await as(2, `select public.delete_expense('${dinner}')`);
check('чужую трату не удалить', r.error?.includes('NOT_AUTHOR'), r);
r = await as(1, `select public.update_expense('${dinner}', 'Ужин в кафе', 'RUB', '2027-03-02', ${shares([[2, 250], [3, 350]])})`);
r = await as(1, `select debtor_id, amount::float from public.expense_shares where expense_id = '${dinner}' order by amount`);
check('автор меняет трату и доли', r.rows?.length === 2 && r.rows[0].amount === 250 && r.rows[1].amount === 350, r);

// Валюта группы
r = await as(2, `select public.set_group_currency('${g}', 'TRY')`);
check('валюту группы меняет только владелец', r.error?.includes('NOT_OWNER'), r);
await as(1, `select public.set_group_currency('${g}', 'TRY')`);
r = await as(3, `select currency from public.expense_settings`);
check('участник видит валюту группы', r.rows?.[0]?.currency === 'TRY', r);

// Выход с долгами запрещён. Сейчас: Б должен А 250, А должен Б 50 → Б должен А 200 ₽.
r = await as(2, `select public.leave_group('${g}')`);
check('Б не может выйти с долгом', r.error?.includes('UNSETTLED_DEBTS'), r);
r = await as(1, `select public.remove_member('${g}', '${U(2)}')`);
check('владелец не может удалить участника с долгом', r.error?.includes('UNSETTLED_DEBTS'), r);
// Б возвращает долг: «А должен мне 200» → в расчёте
await create(2, 'Долг', 'RUB', [[1, 200]]);
r = await as(2, `select public.leave_group('${g}')`);
check('после возврата долга Б может выйти', !r.error, r);
r = await as(2, `select id from public.expenses`);
check('вышедший больше не видит трат группы', r.rows?.length === 0, r);

// В: долг в долларах (А должен В 10 $) не даёт выйти и А
r = await as(1, `select public.leave_group('${g}')`);
check('А не может выйти, пока должен В 10 $', r.error?.includes('UNSETTLED_DEBTS'), r);
r = await as(1, `select public.delete_expense('${coffee}')`);
check('должник не может удалить трату, где он должен', r.error?.includes('NOT_AUTHOR'), r);
await as(3, `select public.delete_expense('${coffee}')`);
r = await as(1, `select title from public.expenses where id = '${coffee}'`);
check('автор удалил трату — она исчезла и у должника', r.rows?.length === 0, r);

// Удаление аккаунта администратором не блокируется долгами: В должен А 350 ₽
await db.exec('reset role;');
r = await db.query(`delete from auth.users where id = '${U(3)}'`).catch((e) => ({ error: e.message }));
check('удаление аккаунта с долгами (админом) проходит', !r.error, r);

// Группа удалена — траты тоже
await as(1, `select public.leave_group('${g}')`);
await db.exec('reset role;');
r = await db.query(`select (select count(*)::int from public.expenses) + (select count(*)::int from public.expense_shares)
                         + (select count(*)::int from public.expense_settings) as n`);
check('группа удалена — траты, доли и валюта тоже', r.rows[0].n === 0, r.rows);

finish();
