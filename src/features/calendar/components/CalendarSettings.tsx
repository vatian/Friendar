import { useState, type FormEvent } from 'react';
import { errorText } from '../../../core/errors';
import { alertDialog, confirmDialog } from '../../../core/telegram/telegram';
import { addNightRule, setCalendarMode, setMinWindow, type Calendar } from '../api';
import { timezoneName } from '../../../core/profile/api';
import { shortDate } from '../logic/format.ts';
import { formatDuration, todayKey } from '../logic/time.ts';
import { ruleForDate, type CalendarMode } from '../logic/windows.ts';

export const MODE_TITLES: Record<CalendarMode, string> = {
  free: 'Свободное время',
  busy: 'Занятое время',
};

// Варианты минимальной длины окна: от 30 минут до 12 часов с шагом 30 минут
export const MIN_WINDOW_OPTIONS = Array.from({ length: 24 }, (_, i) => (i + 1) * 30);

// Как сейчас считается ночь (по правилу на сегодня)
export function nightSummary(calendar: Calendar, ownerTimezone: string): string {
  const rule = ruleForDate(calendar.nightRules, todayKey(ownerTimezone));
  if (!rule?.enabled || !rule.night_start || !rule.night_end) return 'учитывается как обычное время';
  return `не учитывается: ${rule.night_start.slice(0, 5)}–${rule.night_end.slice(0, 5)} (${timezoneName(rule.timezone)})`;
}

interface Props {
  calendar: Calendar;
  ownerTimezone: string;
  onChanged: () => void;
}

// Настройки календаря — видит только владелец группы.
export function CalendarSettings({ calendar, ownerTimezone, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [nightOpen, setNightOpen] = useState(false);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChanged();
    } catch (err) {
      await alertDialog(errorText(err));
    }
  }

  async function onModeChange() {
    const other: CalendarMode = calendar.mode === 'free' ? 'busy' : 'free';
    const ok = await confirmDialog(
      `Сменить режим на «${MODE_TITLES[other]}»? Все отметки участников будут удалены — их смысл поменяется на противоположный.`,
    );
    if (ok) await run(() => setCalendarMode(calendar.id, other));
  }

  if (!open) {
    return (
      <button className="button secondary" onClick={() => setOpen(true)}>
        ⚙️ Настройки календаря
      </button>
    );
  }

  return (
    <div className="card stack">
      <div className="row">
        <div className="form-title grow">Настройки календаря</div>
        <button className="text-button" onClick={() => setOpen(false)}>
          Свернуть
        </button>
      </div>

      <div className="field">
        <span className="hint">Минимальная длина общего окна</span>
        <select
          className="input"
          value={calendar.min_window_minutes}
          onChange={(e) => run(() => setMinWindow(calendar.id, Number(e.target.value)))}
        >
          {MIN_WINDOW_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m * 60000)}
            </option>
          ))}
        </select>
        <span className="hint">Окна короче не показываются — на дорогу тоже нужно время.</span>
      </div>

      <div className="field">
        <span className="hint">Ночное время</span>
        <div>Сейчас ночь {nightSummary(calendar, ownerTimezone)}</div>
        {!nightOpen && (
          <button className="button secondary" onClick={() => setNightOpen(true)}>
            🌙 Не учитывать ночное время
          </button>
        )}
      </div>
      {nightOpen && (
        <NightForm
          calendar={calendar}
          ownerTimezone={ownerTimezone}
          onClose={() => setNightOpen(false)}
          onSaved={() => {
            setNightOpen(false);
            onChanged();
          }}
        />
      )}

      <div className="field">
        <span className="hint">Режим</span>
        <div>{MODE_TITLES[calendar.mode]}</div>
        <button className="button secondary danger" onClick={onModeChange}>
          Сменить на «{MODE_TITLES[calendar.mode === 'free' ? 'busy' : 'free']}»
        </button>
      </div>
    </div>
  );
}

type Scope = 'today' | 'all' | 'period';

function NightForm(props: {
  calendar: Calendar;
  ownerTimezone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayKey(props.ownerTimezone);
  const current = ruleForDate(props.calendar.nightRules, today);
  const [enabled, setEnabled] = useState(true);
  const [start, setStart] = useState(current?.night_start?.slice(0, 5) ?? '23:00');
  const [end, setEnd] = useState(current?.night_end?.slice(0, 5) ?? '07:00');
  const [scope, setScope] = useState<Scope>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  const valid =
    (!enabled || (start && end && start !== end)) && (scope !== 'period' || (from && to && from <= to));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await addNightRule(props.calendar.id, {
        enabled,
        start: enabled ? start : null,
        end: enabled ? end : null,
        from: scope === 'today' ? today : scope === 'period' ? from : null,
        to: scope === 'period' ? to : null,
      });
      props.onSaved();
    } catch (err) {
      await alertDialog(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="sub-card stack" onSubmit={onSubmit}>
      <label className="row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Не учитывать ночь в общих окнах</span>
      </label>

      {enabled && (
        <div className="row">
          <span className="hint">с</span>
          <input type="time" className="input time-input" value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="hint">до</span>
          <input type="time" className="input time-input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      )}
      <p className="hint">Время — по вашему поясу ({timezoneName(props.ownerTimezone)}).</p>

      <div className="field">
        <span className="hint">Применить</span>
        <label className="row">
          <input type="radio" checked={scope === 'today'} onChange={() => setScope('today')} />
          <span>с сегодняшнего дня ({shortDate(today)})</span>
        </label>
        <label className="row">
          <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
          <span>на весь календарь — прошлое и будущее</span>
        </label>
        <label className="row">
          <input type="radio" checked={scope === 'period'} onChange={() => setScope('period')} />
          <span>на определённый период</span>
        </label>
        {scope === 'period' && (
          <div className="row">
            <input type="date" className="input" value={from} max="2030-12-31" onChange={(e) => setFrom(e.target.value)} />
            <span className="hint">—</span>
            <input type="date" className="input" value={to} min={from} max="2030-12-31" onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>

      <button className="button" disabled={!valid || busy}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <button type="button" className="button secondary" onClick={props.onClose} disabled={busy}>
        Отмена
      </button>
    </form>
  );
}
