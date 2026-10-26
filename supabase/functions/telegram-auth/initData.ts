// Проверка подписи initData, которую Telegram передаёт Mini App.
// Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   secret = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   hash   = hex(HMAC_SHA256(key = secret, data = data_check_string))
// data_check_string — все поля кроме hash, отсортированные, в виде key=value через \n.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface ValidInitData {
  user: TelegramUser;
  startParam: string | null;
}

// Насколько старой может быть подпись (Telegram выдаёт новую при каждом открытии)
const MAX_AGE_SECONDS = 24 * 60 * 60;

const encoder = new TextEncoder();

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Сравнение без утечки времени
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Возвращает данные пользователя, если подпись верна, иначе null.
export async function validateInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ValidInitData | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  const expected = toHex(await hmac(secret, dataCheckString));
  if (!safeEqual(expected, hash)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSeconds - authDate > MAX_AGE_SECONDS) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  const user = JSON.parse(userJson) as TelegramUser;
  if (typeof user.id !== 'number' || !user.first_name) return null;

  return { user, startParam: params.get('start_param') };
}
