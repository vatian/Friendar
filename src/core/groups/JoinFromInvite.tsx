import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { errorText } from '../errors';
import { alertDialog } from '../telegram/telegram';
import { joinGroup } from './api';

// Приложение открыли по ссылке t.me/<бот>?startapp=<код>: вступаем и открываем группу.
// Код обрабатываем один раз за запуск — иначе после выхода из группы
// обновление страницы вернуло бы человека обратно.
const HANDLED_KEY = 'friendar:handled-invite';

export function JoinFromInvite() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  const code = auth.status === 'ready' ? auth.startParam : null;

  useEffect(() => {
    if (!code) return;
    try {
      if (sessionStorage.getItem(HANDLED_KEY) === code) return;
      sessionStorage.setItem(HANDLED_KEY, code);
    } catch {
      // хранилище недоступно — просто обработаем код
    }

    setJoining(true);
    joinGroup(code)
      .then((groupId) => navigate(`/group/${groupId}`, { replace: true }))
      .catch((err) => alertDialog(errorText(err)))
      .finally(() => setJoining(false));
  }, [code, navigate]);

  return joining ? <div className="overlay">Вступаем в группу…</div> : null;
}
