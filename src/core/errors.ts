// Коды ошибок из базы (raise exception '...') → понятный текст.
const messages: Record<string, string> = {
  GROUP_FULL: 'В группе уже 6 участников — больше нельзя.',
  TOO_MANY_GROUPS: 'Можно состоять максимум в двух группах. Выйдите из одной, чтобы вступить в новую.',
  INVALID_INVITE: 'Ссылка-приглашение недействительна. Попросите у владельца группы новую.',
  NOT_OWNER: 'Это может сделать только владелец группы.',
  CANNOT_REMOVE_SELF: 'Чтобы уйти из группы, нажмите «Выйти из группы».',
  NOT_AUTHENTICATED: 'Вход не выполнен. Закройте приложение и откройте снова.',
};

// Функции (календарь, траты…) добавляют тексты своих ошибок, не меняя этот файл.
export function registerErrorMessages(extra: Record<string, string>): void {
  Object.assign(messages, extra);
}

export function errorText(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const code = Object.keys(messages).find((key) => message.includes(key));
  if (code) return messages[code];
  if (message.includes('groups_name_check')) return 'Название — от 1 до 64 символов.';
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
