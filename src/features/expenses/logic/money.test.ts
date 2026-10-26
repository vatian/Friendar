// Проверки денежных расчётов. Запуск: npm run test:expenses
import { balances, formatMoney, historyWith, parseAmount, splitEvenly, type Share } from './money.ts';

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  console.log(cond ? 'OK   ' : 'FAIL ', name, cond ? '' : JSON.stringify(got));
  if (!cond) failed++;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Ввод сумм
check('«100» → 10000 коп.', parseAmount('100') === 10000);
check('«12,5» → 1250 коп.', parseAmount('12,5') === 1250);
check('«1 200.99» → 120099 коп.', parseAmount('1 200.99') === 120099);
check('три знака после запятой — ошибка', parseAmount('1.999') === null);
check('ноль — ошибка', parseAmount('0') === null);
check('текст — ошибка', parseAmount('сто') === null);
check('минус — ошибка', parseAmount('-5') === null);

// Деление поровну
check('900 на троих = 300×3', same(splitEvenly(90000, 3), [30000, 30000, 30000]));
check('100 на троих = 33,34 + 33,33 + 33,33', same(splitEvenly(10000, 3), [3334, 3333, 3333]));
check('сумма частей всегда равна целому', splitEvenly(100001, 7).reduce((a, b) => a + b) === 100001);

// Отображение
const nb = (s: string) => s.replace(/\s/g, ' ');
check('рубли', nb(formatMoney(150050, 'RUB')) === '1 500,5 ₽', formatMoney(150050, 'RUB'));
check('доллары', nb(formatMoney(1000, 'USD')) === '10 $', formatMoney(1000, 'USD'));
check('лиры', nb(formatMoney(9990, 'TRY')) === '99,9 ₺', formatMoney(9990, 'TRY'));

// Итоги: пример из задания — А пишет «Б должен 100», Б пишет «А должен 50» → Б должен А 50
const share = (expense_id: string, payer_id: string, debtor_id: string, amount: number, currency = 'RUB', spent_on = '2027-03-01'): Share => ({
  expense_id, payer_id, debtor_id, amount, currency, title: expense_id, spent_on, created_at: `${spent_on}T12:00:00Z`,
});
const shares = [
  share('e1', 'A', 'B', 100),
  share('e2', 'B', 'A', 50, 'RUB', '2027-03-02'),
  share('e3', 'C', 'A', 10, 'USD', '2027-03-03'),
  share('e4', 'B', 'C', 999), // чужое — А такого не видит, но и не должно учитываться
];
const forA = balances(shares, 'A');
check('Б должен А 50 ₽', forA.get('B')?.get('RUB') === 5000, [...(forA.get('B') ?? [])]);
check('А должен В 10 $', forA.get('C')?.get('USD') === -1000, [...(forA.get('C') ?? [])]);
check('валюты не смешиваются', forA.get('C')?.has('RUB') === false);
const forB = balances(shares, 'B');
check('для Б: он должен А 50 ₽', forB.get('A')?.get('RUB') === -5000);
const settled = balances([...shares, share('e5', 'B', 'A', 50)], 'A');
check('после возврата 50 ₽ — в расчёте', !settled.has('B'), [...settled]);

// История
const h = historyWith(shares, 'A', 'B');
check('история с Б: 2 записи, новые сверху', same(h.map((e) => e.expense_id), ['e2', 'e1']), h);
check('в истории видно, кто платил', h[0].paidByMe === false && h[1].paidByMe === true);
check('в истории с Б нет трат с В', historyWith(shares, 'A', 'B').every((e) => e.expense_id !== 'e3'));

console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
