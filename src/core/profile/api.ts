import { supabase } from '../supabase/client';

export async function updateTimezone(userId: string, timezone: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ timezone, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// Пояс телефона, например Europe/Moscow
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// «GMT+3» для пояса в текущий момент
export function utcOffsetLabel(timezone: string): string {
  const part = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? '';
}

// Все пояса, отсортированные по смещению от UTC
export function allTimezones(): { id: string; label: string }[] {
  const now = new Date();
  const offsetMinutes = (tz: string) => {
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    return (local.getTime() - utc.getTime()) / 60000;
  };
  return Intl.supportedValuesOf('timeZone')
    .map((id) => ({ id, offset: offsetMinutes(id) }))
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
    .map(({ id }) => ({ id, label: `${utcOffsetLabel(id)} · ${id.replace(/_/g, ' ')}` }));
}
