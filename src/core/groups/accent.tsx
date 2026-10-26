import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { supabase } from '../supabase/client';

// Цвета кнопок группы (премиум-владелец). Те же значения разрешает база.
export const ACCENT_COLORS = [
  '#2481cc',
  '#1f6feb',
  '#0f9d9a',
  '#2e9e5b',
  '#7b5cd6',
  '#d6488f',
  '#e04f5f',
  '#e8833a',
  '#a0703c',
  '#5b6573',
];

// Запоминаем цвет группы, чтобы при переходе «группа → календарь» не загружать его снова
const cache = new Map<string, string | null>();

export function rememberGroupAccent(groupId: string, color: string | null): void {
  cache.set(groupId, color);
}

function useGroupAccent(groupId: string): string | null {
  const [color, setColor] = useState(() => cache.get(groupId) ?? null);

  useEffect(() => {
    if (cache.has(groupId)) {
      setColor(cache.get(groupId) ?? null);
      return;
    }
    let cancelled = false;
    supabase
      .from('groups')
      .select('accent_color')
      .eq('id', groupId)
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.accent_color ?? null;
        cache.set(groupId, value);
        if (!cancelled) setColor(value);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return color;
}

// Всё внутри получает цвет кнопок группы (если он задан); иначе — цвет темы Telegram.
export function GroupAccent({ groupId, color, children }: { groupId: string; color?: string | null; children: ReactNode }) {
  const loaded = useGroupAccent(groupId);
  const value = color !== undefined ? color : loaded;
  const style = value ? ({ '--button': value, '--button-text': '#ffffff' } as CSSProperties) : undefined;
  return <div style={style}>{children}</div>;
}
