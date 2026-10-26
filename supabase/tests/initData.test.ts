// Проверка подписи Telegram: подписываем данные тестовым токеном так же, как Telegram.
import { createHmac } from 'node:crypto';
import { validateInitData } from '../functions/telegram-auth/initData.ts';

const BOT_TOKEN = '123456:TEST-token-for-tests-only';
const now = Math.floor(Date.now() / 1000);

function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: 'Аня', username: 'anya' });
const fields = { auth_date: String(now), user, start_param: 'abc123', signature: 'xyz' };

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(cond ? 'OK   ' : 'FAIL ', name);
  if (!cond) failed++;
}

const ok = await validateInitData(sign(fields), BOT_TOKEN);
check('верная подпись принимается', ok?.user.id === 42 && ok.user.username === 'anya');
check('start_param читается', ok?.startParam === 'abc123');

const tampered = sign(fields).replace('anya', 'evil');
check('подменённые данные отклоняются', (await validateInitData(tampered, BOT_TOKEN)) === null);

check(
  'подпись чужим токеном отклоняется',
  (await validateInitData(sign(fields, '999:other'), BOT_TOKEN)) === null,
);

const old = sign({ ...fields, auth_date: String(now - 2 * 24 * 3600) });
check('устаревшая подпись отклоняется', (await validateInitData(old, BOT_TOKEN)) === null);

check('пустые данные отклоняются', (await validateInitData('', BOT_TOKEN)) === null);

console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
