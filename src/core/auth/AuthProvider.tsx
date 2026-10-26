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

interface AuthContextValue {
  state: AuthState;
  setProfile: (profile: Profile) => void;
}

const AuthContext = createContext<AuthContextValue>({
  state: { status: 'loading' },
  setProfile: () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext).state;
}

// Для экранов внутри приложения: к этому моменту вход уже выполнен.
export function useProfile(): [Profile, (profile: Profile) => void] {
  const { state, setProfile } = useContext(AuthContext);
  if (state.status !== 'ready') throw new Error('useProfile() до входа');
  return [state.profile, setProfile];
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

// Вход выполняется один раз за запуск: два одновременных входа мешали бы
// друг другу (одноразовый токен второго отменяет токен первого).
let signInOnce: Promise<AuthState> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    signInOnce ??= signIn();
    signInOnce.then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setProfile = (profile: Profile) =>
    setState((s) => (s.status === 'ready' ? { ...s, profile } : s));

  return <AuthContext.Provider value={{ state, setProfile }}>{children}</AuthContext.Provider>;
}
