// Edge Function «telegram-auth»: вход через Telegram.
//
// 1. Приложение присылает initData (подписанные Telegram данные о пользователе).
// 2. Проверяем подпись токеном бота — подделать её без токена нельзя.
// 3. Создаём пользователя Supabase (если его ещё нет) и обновляем профиль:
//    ник, имя и фото всегда берутся свежие из Telegram.
// 4. Выдаём обычную сессию Supabase — с ней приложение работает с базой,
//    а правила доступа (RLS) знают, кто это.
//
// Секреты (задаются в Supabase → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN — токен бота
//   SB_SECRET_KEY      — секретный ключ Supabase (sb_secret_...)
// SUPABASE_URL Supabase подставляет сам.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateInitData } from './initData.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const secretKey = Deno.env.get('SB_SECRET_KEY')!;
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, secretKey, clientOptions);

// Технический адрес почты: Supabase Auth требует email, письма никуда не отправляются.
const emailFor = (telegramId: number) => `tg${telegramId}@users.friendar.app`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let initData: unknown;
  try {
    ({ initData } = await req.json());
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  if (typeof initData !== 'string' || !initData) return json({ error: 'BAD_REQUEST' }, 400);

  const valid = await validateInitData(initData, botToken);
  if (!valid) return json({ error: 'INVALID_INIT_DATA' }, 401);
  const { user, startParam } = valid;
  const email = emailFor(user.id);

  // Создаём пользователя; если он уже есть — Supabase вернёт ошибку, это нормально.
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { telegram_id: user.id },
  });
  if (created.error && created.error.code !== 'email_exists') {
    console.error('createUser', created.error);
    return json({ error: 'AUTH_FAILED' }, 500);
  }

  // Одноразовый токен входа: по нему ниже получаем сессию.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) {
    console.error('generateLink', link.error);
    return json({ error: 'AUTH_FAILED' }, 500);
  }
  const userId = link.data.user.id;

  const profile = await admin.from('profiles').upsert({
    id: userId,
    telegram_id: user.id,
    username: user.username ?? null,
    first_name: user.first_name,
    last_name: user.last_name ?? null,
    photo_url: user.photo_url ?? null,
    updated_at: new Date().toISOString(),
  });
  if (profile.error) {
    console.error('profiles upsert', profile.error);
    return json({ error: 'AUTH_FAILED' }, 500);
  }

  // Отдельный клиент, чтобы сессия пользователя не смешалась с admin-клиентом.
  const verifier = createClient(supabaseUrl, secretKey, clientOptions);
  const verified = await verifier.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session) {
    console.error('verifyOtp', verified.error);
    return json({ error: 'AUTH_FAILED' }, 500);
  }

  const { access_token, refresh_token } = verified.data.session;
  return json({ access_token, refresh_token, start_param: startParam });
});
