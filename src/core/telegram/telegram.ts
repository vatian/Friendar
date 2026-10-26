// Обёртка над официальным Telegram WebApp SDK (скрипт подключён в index.html).
// Описываем только то, чем реально пользуемся.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  onEvent(event: 'themeChanged', handler: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp;

// Вне Telegram скрипт тоже загружается, но initData пустая — так и отличаем.
export function isInsideTelegram(): boolean {
  return Boolean(tg?.initData);
}

// Имя для показа: ник, а если его нет — имя.
export function displayName(user: Pick<TelegramUser, 'username' | 'first_name'>): string {
  return user.username ? `@${user.username}` : user.first_name;
}

// Сообщаем Telegram, что приложение загрузилось, и синхронизируем светлую/тёмную тему.
// Сами цвета Telegram подставляет в CSS-переменные --tg-theme-*.
export function initTelegram(): void {
  if (!tg) return;
  const applyScheme = () => {
    document.documentElement.dataset.theme = tg.colorScheme;
  };
  applyScheme();
  tg.onEvent('themeChanged', applyScheme);
  tg.ready();
  tg.expand();
}
