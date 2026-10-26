import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { tg } from './telegram';

// Показывает системную кнопку «Назад» Telegram на вложенных экранах.
export function useBackButton(to: string = '/'): void {
  const navigate = useNavigate();

  useEffect(() => {
    const button = tg?.BackButton;
    if (!button) return;
    const goBack = () => navigate(to);
    button.onClick(goBack);
    button.show();
    return () => {
      button.offClick(goBack);
      button.hide();
    };
  }, [navigate, to]);
}
