import { supabase } from '../supabase/client';

// Проверку кода делает база; код в приложении не хранится.
// true — премиум активирован, false — неверный код.
export async function redeemPromo(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('redeem_promo', { p_code: code });
  if (error) throw error;
  return data as boolean;
}

// Своё имя вместо ника (премиум); null — вернуть ник
export async function setMyName(name: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_my_name', { p_name: name });
  if (error) throw error;
}

export const isPremium = (profile: { premium_since: string | null }) => Boolean(profile.premium_since);
