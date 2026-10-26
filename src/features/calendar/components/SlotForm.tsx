import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useProfile } from '../../../core/auth/AuthProvider';
import { errorText } from '../../../core/errors';
import { allTimezones, timezoneName } from '../../../core/profile/api';
import { confirmDialog } from '../../../core/telegram/telegram';
import { useAsync } from '../../../core/ui/useAsync';
import { deleteEvent, fetchMyCalendars, saveEvent, type Slot } from '../api';
import { rangeLabel } from '../logic/format.ts';
import { dateKey, formatDuration, formatTime, zonedMoment } from '../logic/time.ts';
import type { CalendarMode } from '../logic/windows.ts';

interface Props {
  calendarId: string;
  mode: CalendarMode;
  slot: Slot | null; // null — новое событие
  dayKey: string; // выбранный день — по умолчанию для нового события
  viewerTimezone: string; // основной пояс из профиля
  firstDay: string;
  lastDay: string;
  onDone: () => void;
}

// Форма события: начало и конец вводятся вручную в выбранном часовом поясе.
// Событие можно сразу добавить в другие свои календари с тем же режимом —
// тогда изменения и удаление применяются во всех.
export function SlotForm(props: Props) {
  const { slot, viewerTimezone } = props;
  const [profile] = useProfile();
  const initialTz = slot?.timezone ?? viewerTimezone;
  const initialStart = slot ? Date.parse(slot.starts_at) : null;
  const initialEnd = slot ? Date.parse(slot.ends_at) : null;

  const [timezone, setTimezone] = useState(initialTz);
  const [startDate, setStartDate] = useState(initialStart ? dateKey(initialStart, initialTz) : props.dayKey);
  const [startTime, setStartTime] = useState(initialStart ? formatTime(initialStart, initialTz) : '18:00');
  const [endDate, setEndDate] = useState(initialEnd ? dateKey(initialEnd, initialTz) : props.dayKey);
  const [endTime, setEndTime] = useState(initialEnd ? formatTime(initialEnd, initialTz) : '21:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezones = useMemo(allTimezones, []);

  const seriesId = slot?.series_id ?? null;
  const [calendars] = useAsync(() => fetchMyCalendars(profile.id, seriesId), [profile.id, seriesId]);
  const [chosen, setChosen] = useState<Set<string>>(new Set([props.calendarId]));
  const current = calendars.status === 'ready' ? calendars.data.filter((c) => c.hasEvent).map((c) => c.id) : [];

  // Когда загрузились календари, отмечаем те, где событие уже есть
  useEffect(() => {
    if (calendars.status === 'ready') {
      setChosen(new Set([props.calendarId, ...calendars.data.filter((c) => c.hasEvent).map((c) => c.id)]));
    }
  }, [calendars, props.calendarId]);

  const start = startDate && startTime ? zonedMoment(startDate, startTime, timezone) : NaN;
  const end = endDate && endTime ? zonedMoment(endDate, endTime, timezone) : NaN;
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const what = props.mode === 'free' ? 'свободны' : 'заняты';

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || calendars.status !== 'ready') return;
    if (startDate < props.firstDay || endDate > props.lastDay) {
      setError('Отметка должна быть в пределах календаря — до 31 декабря 2030 года.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveEvent({
        seriesId,
        input: {
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(end).toISOString(),
          timezone,
        },
        calendarIds: [...chosen],
        currentCalendarIds: current,
      });
      props.onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!slot) return;
    const message =
      current.length > 1 ? `Удалить событие из всех календарей (${current.length})?` : 'Удалить это событие?';
    if (!(await confirmDialog(message))) return;
    setBusy(true);
    try {
      await deleteEvent(slot.series_id);
      props.onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <div className="form-title">{slot ? 'Изменить событие' : `Когда вы ${what}?`}</div>

      <div className="field">
        <span className="hint">Начало</span>
        <div className="row">
          <input
            type="date"
            className="input"
            value={startDate}
            min={props.firstDay}
            max={props.lastDay}
            onChange={(e) => {
              // Конец по умолчанию сдвигается вместе с началом
              if (endDate === startDate || endDate < e.target.value) setEndDate(e.target.value);
              setStartDate(e.target.value);
            }}
          />
          <input
            type="time"
            className="input time-input"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="hint">Конец</span>
        <div className="row">
          <input
            type="date"
            className="input"
            value={endDate}
            min={startDate}
            max={props.lastDay}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <input
            type="time"
            className="input time-input"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="hint">Часовой пояс</span>
        <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {timezones.map((tz) => (
            <option key={tz.id} value={tz.id}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {calendars.status === 'ready' && calendars.data.length > 1 && (
        <div className="field">
          <span className="hint">Календари</span>
          {calendars.data.map((c) => {
            const isCurrent = c.id === props.calendarId;
            const otherMode = c.mode !== props.mode;
            return (
              <label key={c.id} className={`row ${otherMode ? 'disabled-option' : ''}`}>
                <input
                  type="checkbox"
                  checked={chosen.has(c.id)}
                  disabled={isCurrent || otherMode || busy}
                  onChange={() => toggle(c.id)}
                />
                <span className="grow">
                  «{c.groupName}»
                  {isCurrent && <span className="hint"> · этот календарь</span>}
                  {otherMode && (
                    <span className="hint">
                      {' '}
                      · другой режим: там отмечают {c.mode === 'free' ? 'свободное' : 'занятое'} время
                    </span>
                  )}
                </span>
              </label>
            );
          })}
          {slot && current.length > 1 && (
            <span className="hint">Изменения применятся во всех отмеченных календарях.</span>
          )}
        </div>
      )}

      {valid && (
        <p className="hint">
          {formatDuration(end - start)}
          {timezone !== viewerTimezone &&
            ` · по вашему времени (${timezoneName(viewerTimezone)}): ${rangeLabel({ start, end }, dateKey(start, viewerTimezone), viewerTimezone)}`}
        </p>
      )}
      {!valid && Number.isFinite(start) && Number.isFinite(end) && (
        <p className="error">Конец должен быть позже начала.</p>
      )}
      {calendars.status === 'error' && <p className="error">{errorText(calendars.error)}</p>}
      {error && <p className="error">{error}</p>}

      <button className="button" disabled={!valid || busy || calendars.status !== 'ready'}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <div className="row">
        <button type="button" className="button secondary" onClick={props.onDone} disabled={busy}>
          Отмена
        </button>
        {slot && (
          <button type="button" className="button secondary danger" onClick={onDelete} disabled={busy}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
