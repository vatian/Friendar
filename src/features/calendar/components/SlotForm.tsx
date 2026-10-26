import { useMemo, useState, type FormEvent } from 'react';
import { errorText } from '../../../core/errors';
import { allTimezones, timezoneName } from '../../../core/profile/api';
import { confirmDialog } from '../../../core/telegram/telegram';
import { addSlot, deleteSlot, updateSlot, type Slot } from '../api';
import { rangeLabel } from '../logic/format.ts';
import { dateKey, formatDuration, formatTime, zonedMoment } from '../logic/time.ts';
import type { CalendarMode } from '../logic/windows.ts';

interface Props {
  calendarId: string;
  mode: CalendarMode;
  slot: Slot | null; // null — новая отметка
  dayKey: string; // выбранный день — по умолчанию для новой отметки
  viewerTimezone: string; // основной пояс из профиля
  firstDay: string;
  lastDay: string;
  onDone: () => void;
}

// Форма отметки: начало и конец вводятся вручную в выбранном часовом поясе.
export function SlotForm(props: Props) {
  const { slot, viewerTimezone } = props;
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

  const start = startDate && startTime ? zonedMoment(startDate, startTime, timezone) : NaN;
  const end = endDate && endTime ? zonedMoment(endDate, endTime, timezone) : NaN;
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const what = props.mode === 'free' ? 'свободны' : 'заняты';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (startDate < props.firstDay || endDate > props.lastDay) {
      setError('Отметка должна быть в пределах календаря — до 31 декабря 2030 года.');
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      timezone,
    };
    try {
      if (slot) await updateSlot(slot.id, input);
      else await addSlot(props.calendarId, input);
      props.onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!slot || !(await confirmDialog('Удалить эту отметку?'))) return;
    setBusy(true);
    try {
      await deleteSlot(slot.id);
      props.onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <div className="form-title">{slot ? 'Изменить отметку' : `Когда вы ${what}?`}</div>

      <div className="field">
        <span className="hint">Начало</span>
        <div className="row">
          <input type="date" className="input" value={startDate} min={props.firstDay} max={props.lastDay}
            onChange={(e) => {
              // Конец по умолчанию сдвигается вместе с началом
              if (endDate === startDate || endDate < e.target.value) setEndDate(e.target.value);
              setStartDate(e.target.value);
            }} />
          <input type="time" className="input time-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <span className="hint">Конец</span>
        <div className="row">
          <input type="date" className="input" value={endDate} min={startDate} max={props.lastDay}
            onChange={(e) => setEndDate(e.target.value)} />
          <input type="time" className="input time-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
      {error && <p className="error">{error}</p>}

      <button className="button" disabled={!valid || busy}>
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
