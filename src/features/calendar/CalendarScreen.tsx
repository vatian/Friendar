import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from '../../core/auth/AuthProvider';
import { errorText } from '../../core/errors';
import { displayName } from '../../core/telegram/telegram';
import { useAsync } from '../../core/ui/useAsync';
import { fetchCalendarBundle, subscribeToCalendar, type Calendar, type CalendarMember, type Slot } from './api';
import { CalendarSettings, MODE_TITLES, nightSummary } from './components/CalendarSettings';
import { CreateCalendar } from './components/CreateCalendar';
import { MonthGrid } from './components/MonthGrid';
import { SlotForm } from './components/SlotForm';
import { timezoneName } from '../../core/profile/api';
import { dayTitle, rangeLabel } from './logic/format.ts';
import { addDays, dateKey, formatDuration, parseDateKey, startOfDay, todayKey } from './logic/time.ts';
import { commonWindows, windowsOnDay, type Interval } from './logic/windows.ts';
import './calendar.css';

export function CalendarScreen({ groupId }: { groupId: string }) {
  const [bundle, reload] = useAsync(() => fetchCalendarBundle(groupId), [groupId]);
  const [profile] = useProfile();

  if (bundle.status === 'loading') return <p className="hint">Загружаем календарь…</p>;
  if (bundle.status === 'error') return <p className="error">{errorText(bundle.error)}</p>;
  if (!bundle.data) return <p className="hint">Группа не найдена или вы в ней больше не состоите.</p>;

  const { calendar, ownerId, members } = bundle.data;
  const isOwner = ownerId === profile.id;

  if (!calendar) {
    return isOwner ? (
      <CreateCalendar groupId={groupId} onCreated={reload} />
    ) : (
      <div className="card stack">
        <h1 className="page-title">Календарь группы</h1>
        <p>Владелец группы ещё не создал календарь.</p>
      </div>
    );
  }

  return <CalendarView calendar={calendar} members={members} isOwner={isOwner} reload={reload} />;
}

function CalendarView(props: {
  calendar: Calendar;
  members: CalendarMember[];
  isOwner: boolean;
  reload: () => void;
}) {
  const { calendar, members, isOwner, reload } = props;
  const [profile] = useProfile();
  const tz = profile.timezone;
  const today = todayKey(tz);
  const firstDay = calendar.starts_on;
  const lastDay = calendar.ends_on;

  const initialDay = today < firstDay ? firstDay : today > lastDay ? lastDay : today;
  const [selected, setSelected] = useState(initialDay);
  const [view, setView] = useState(() => parseDateKey(initialDay));
  const [editing, setEditing] = useState<Slot | 'new' | null>(null);

  useLiveUpdates(calendar, reload);

  // Общие окна для видимого месяца (с запасом в 2 дня, чтобы окна на стыке месяцев считались целиком)
  const windows = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const monthStart = `${view.year}-${pad(view.month)}-01`;
    const nextMonth = view.month === 12 ? `${view.year + 1}-01-01` : `${view.year}-${pad(view.month + 1)}-01`;
    const range: Interval = {
      start: Math.max(startOfDay(addDays(monthStart, -2), tz), startOfDay(firstDay, tz)),
      end: Math.min(startOfDay(addDays(nextMonth, 2), tz), startOfDay(addDays(lastDay, 1), tz)),
    };
    if (range.end <= range.start) return [];
    return commonWindows({
      mode: calendar.mode,
      range,
      memberIds: members.map((m) => m.id),
      slots: calendar.slots.map((s) => ({
        user_id: s.user_id,
        start: Date.parse(s.starts_at),
        end: Date.parse(s.ends_at),
      })),
      nightRules: calendar.nightRules,
      minMinutes: calendar.min_window_minutes,
    });
  }, [calendar, members, view, tz, firstDay, lastDay]);

  const memberIds = new Set(members.map((m) => m.id));
  const markedIds = new Set(calendar.slots.filter((s) => memberIds.has(s.user_id)).map((s) => s.user_id));
  const notMarked = members.filter((m) => !markedIds.has(m.id));
  // В режиме «Свободное» без единой отметки весь календарь формально «свободен» — это не показываем
  const nobodyMarked = calendar.mode === 'free' && markedIds.size === 0;

  const windowDays = useMemo(() => {
    const days = new Set<string>();
    if (nobodyMarked) return days;
    for (const w of windows) {
      for (let key = dateKey(w.start, tz); key <= dateKey(w.end - 1, tz); key = addDays(key, 1)) days.add(key);
    }
    return days;
  }, [windows, tz, nobodyMarked]);

  const mySlots = calendar.slots
    .filter((s) => s.user_id === profile.id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const myDays = new Set<string>();
  for (const s of mySlots) {
    const end = Date.parse(s.ends_at) - 1;
    for (let key = dateKey(Date.parse(s.starts_at), tz); key <= dateKey(end, tz); key = addDays(key, 1)) myDays.add(key);
  }

  const dayWindows = nobodyMarked ? [] : windowsOnDay(windows, selected, tz);
  const myDaySlots = mySlots.filter((s) => {
    const interval = { start: Date.parse(s.starts_at), end: Date.parse(s.ends_at) };
    return windowsOnDay([interval], selected, tz).length > 0;
  });

  if (editing) {
    return (
      <SlotForm
        calendarId={calendar.id}
        mode={calendar.mode}
        slot={editing === 'new' ? null : editing}
        dayKey={selected}
        viewerTimezone={tz}
        firstDay={firstDay}
        lastDay={lastDay}
        onDone={() => {
          setEditing(null);
          reload();
        }}
      />
    );
  }

  const markWord = calendar.mode === 'free' ? 'свободное' : 'занятое';

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Календарь</h1>
        <div className="hint">
          {MODE_TITLES[calendar.mode]} · окна от {formatDuration(calendar.min_window_minutes * 60000)} · ночь{' '}
          {nightSummary(calendar, tz)}
        </div>
        <div className="hint">Время показано по поясу: {timezoneName(tz)}</div>
      </div>

      <MonthGrid
        year={view.year}
        month={view.month}
        selected={selected}
        today={today}
        firstDay={firstDay}
        lastDay={lastDay}
        windowDays={windowDays}
        myDays={myDays}
        onSelect={setSelected}
        onMonthChange={(year, month) => setView({ year, month, day: 1 })}
      />

      <h2 className="section-title">{dayTitle(selected)} · общие окна</h2>
      <div className="list">
        {nobodyMarked ? (
          <div className="list-item hint">Пока никто не отметил свободное время.</div>
        ) : dayWindows.length === 0 ? (
          <div className="list-item hint">
            В этот день нет общего окна от {formatDuration(calendar.min_window_minutes * 60000)}.
          </div>
        ) : (
          dayWindows.map((w) => (
            <div key={w.start} className="list-item">
              <div className="grow window-time">{rangeLabel(w, selected, tz)}</div>
              <div className="hint">{formatDuration(w.end - w.start)}</div>
            </div>
          ))
        )}
      </div>
      {notMarked.length > 0 && (
        <p className="hint">
          Ещё не отметились (считаются свободными): {notMarked.map((m) => displayName(m)).join(', ')}
        </p>
      )}

      <h2 className="section-title">Мои отметки · {markWord} время</h2>
      <div className="list">
        {myDaySlots.length === 0 && <div className="list-item hint">В этот день отметок нет.</div>}
        {myDaySlots.map((s) => {
          const interval = { start: Date.parse(s.starts_at), end: Date.parse(s.ends_at) };
          return (
            <button key={s.id} className="list-item slot-item" onClick={() => setEditing(s)}>
              <div className="grow">
                <div>{rangeLabel(interval, selected, tz)}</div>
                {s.timezone !== tz && (
                  <div className="hint">
                    {rangeLabel(interval, dateKey(interval.start, s.timezone), s.timezone)} по поясу{' '}
                    {timezoneName(s.timezone)}
                  </div>
                )}
              </div>
              <span className="chevron">›</span>
            </button>
          );
        })}
      </div>
      <button className="button" onClick={() => setEditing('new')}>
        + Добавить {markWord} время
      </button>

      {isOwner && <CalendarSettings calendar={calendar} ownerTimezone={tz} onChanged={reload} />}
    </div>
  );
}

// Перезагрузка при изменениях от других участников (Realtime) и при возвращении в приложение.
function useLiveUpdates(calendar: Calendar, reload: () => void) {
  const slotIds = useRef(new Set<string>());
  slotIds.current = new Set(calendar.slots.map((s) => s.id));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Несколько изменений подряд (например, смена режима) — одна перезагрузка
    const scheduleReload = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 400);
    };
    const unsubscribe = subscribeToCalendar(calendar.id, (id) => slotIds.current.has(id), scheduleReload);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleReload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [calendar.id, reload]);
}
