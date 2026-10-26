import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../supabase/client';
import { tg } from '../telegram/telegram';

export interface Profile {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  timezone: string;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: Profile; startParam: string | null };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

const errorMessages: Record<string, string> = {
  INVALID_INIT_DATA: 'Telegram не подтвердил, что это вы. Закройте приложение и откройте снова.',
  AUTH_FAILED: 'Не получилось войти. Попробуйте ещё раз чуть позже.',
};

// При каждом открытии входим заново: так ник и имя всегда свежие,
// а если в Telegram сменили аккаунт, приложение не покажет чужие данные.
async function signIn(): Promise<AuthState> {
  if (!isSupabaseConfigured) {
    return { status: 'error', message: 'Приложение не настроено: нет адреса Supabase.' };
  }

  const { data, error } = await supabase.functions.invoke('telegram-auth', {
    body: { initData: tg?.initData },
  });
  if (error || !data?.access_token) {
    let code: string | undefined;
    try {
      code = (await error?.context?.json())?.error;
    } catch {
      // ответ без тела — покажем общее сообщение
    }
    return { status: 'error', message: errorMessages[code ?? ''] ?? errorMessages.AUTH_FAILED };
  }

  const session = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  const userId = session.data.user?.id;
  if (session.error || !userId) {
    return { status: 'error', message: errorMessages.AUTH_FAILED };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, telegram_id, username, first_name, last_name, photo_url, timezone')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    return { status: 'error', message: errorMessages.AUTH_FAILED };
  }

  return { status: 'ready', profile, startParam: data.start_param ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    signIn().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
