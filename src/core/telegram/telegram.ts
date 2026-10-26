// Обёртка над официальным Telegram WebApp SDK (скрипт подключён в index.html).
// Описываем только то, чем реально пользуемся.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  colorScheme: 'light' | 'dark';
  BackButton: TelegramBackButton;
  ready(): void;
  expand(): void;
  onEvent(event: 'themeChanged', handler: () => void): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  showAlert(message: string, callback?: () => void): void;
  openTelegramLink(url: string): void;
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
export function displayName(user: { username?: string | null; first_name: string }): string {
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

// Нативное окно подтверждения Telegram (в браузере — обычный confirm).
export function confirmDialog(message: string): Promise<boolean> {
  if (!tg) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => tg.showConfirm(message, resolve));
}

export function alertDialog(message: string): Promise<void> {
  if (!tg) {
    window.alert(message);
    return Promise.resolve();
  }
  return new Promise((resolve) => tg.showAlert(message, () => resolve()));
}

// Ссылка-приглашение: открывает Mini App бота и передаёт код группы.
export function inviteLink(code: string): string {
  return `https://t.me/${import.meta.env.VITE_BOT_USERNAME}?startapp=${code}`;
}

// Открывает в Telegram выбор чата, куда переслать приглашение.
export function shareLink(url: string, text: string): void {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(shareUrl);
  else window.open(shareUrl, '_blank');
}
