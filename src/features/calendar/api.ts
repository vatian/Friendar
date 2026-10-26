import { supabase } from '../../core/supabase/client';
import type { CalendarMode, NightRule } from './logic/windows.ts';

export interface CalendarMember {
  id: string;
  username: string | null;
  first_name: string;
}

export interface Slot {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
}

export interface Calendar {
  id: string;
  mode: CalendarMode;
  min_window_minutes: number;
  starts_on: string;
  ends_on: string;
  slots: Slot[];
  nightRules: NightRule[];
}

export interface CalendarBundle {
  ownerId: string;
  members: CalendarMember[];
  calendar: Calendar | null;
}

// Всё для экрана календаря — участники, календарь, отметки, правила ночи — одним запросом.
export async function fetchCalendarBundle(groupId: string): Promise<CalendarBundle | null> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      `owner_id,
       group_members(profiles(id, username, first_name)),
       calendars(id, mode, min_window_minutes, starts_on, ends_on,
         calendar_slots(id, user_id, starts_at, ends_at, timezone),
         calendar_night_rules(enabled, night_start, night_end, timezone, applies_from, applies_to, created_at))`,
    )
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Связи без сгенерированных типов — уточняем вручную
  const row = data as unknown as {
    owner_id: string;
    group_members: { profiles: CalendarMember | null }[];
    calendars: RawCalendar | RawCalendar[] | null;
  };
  type RawCalendar = Omit<Calendar, 'slots' | 'nightRules'> & {
    calendar_slots: Slot[];
    calendar_night_rules: NightRule[];
  };
  const raw = Array.isArray(row.calendars) ? (row.calendars[0] ?? null) : row.calendars;

  return {
    ownerId: row.owner_id,
    members: row.group_members.flatMap((m) => (m.profiles ? [m.profiles] : [])),
    calendar: raw && {
      id: raw.id,
      mode: raw.mode,
      min_window_minutes: raw.min_window_minutes,
      starts_on: raw.starts_on,
      ends_on: raw.ends_on,
      slots: raw.calendar_slots,
      nightRules: raw.calendar_night_rules,
    },
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const createCalendar = (groupId: string, mode: CalendarMode, minMinutes: number) =>
  rpc<string>('create_calendar', {
    p_group_id: groupId,
    p_mode: mode,
    p_min_window_minutes: minMinutes,
  });

export const setCalendarMode = (calendarId: string, mode: CalendarMode) =>
  rpc<void>('set_calendar_mode', { p_calendar_id: calendarId, p_mode: mode });

export const setMinWindow = (calendarId: string, minutes: number) =>
  rpc<void>('set_min_window', { p_calendar_id: calendarId, p_minutes: minutes });

export const addNightRule = (
  calendarId: string,
  rule: { enabled: boolean; start: string | null; end: string | null; from: string | null; to: string | null },
) =>
  rpc<string>('add_night_rule', {
    p_calendar_id: calendarId,
    p_enabled: rule.enabled,
    p_night_start: rule.start,
    p_night_end: rule.end,
    p_from: rule.from,
    p_to: rule.to,
  });

export interface SlotInput {
  starts_at: string;
  ends_at: string;
  timezone: string;
}

export async function addSlot(calendarId: string, slot: SlotInput): Promise<void> {
  const { error } = await supabase.from('calendar_slots').insert({ calendar_id: calendarId, ...slot });
  if (error) throw error;
}

export async function updateSlot(id: string, slot: SlotInput): Promise<void> {
  const { error } = await supabase.from('calendar_slots').update(slot).eq('id', id);
  if (error) throw error;
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_slots').delete().eq('id', id);
  if (error) throw error;
}

// Живое обновление: база сама сообщает об изменениях (Supabase Realtime),
// а мы перезагружаем календарь. Постоянного опроса сервера нет.
export function subscribeToCalendar(
  calendarId: string,
  isCalendarSlot: (slotId: string) => boolean,
  onChange: () => void,
): () => void {
  const filter = `calendar_id=eq.${calendarId}`;
  const channel = supabase
    .channel(`calendar:${calendarId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_slots', filter }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calendar_slots', filter }, onChange)
    // Удаления нельзя отфильтровать по календарю — проверяем, что удалена отметка этого календаря
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calendar_slots' }, (payload) => {
      const id = (payload.old as { id?: string }).id;
      if (id && isCalendarSlot(id)) onChange();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_night_rules', filter }, onChange)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calendars', filter: `id=eq.${calendarId}` },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
