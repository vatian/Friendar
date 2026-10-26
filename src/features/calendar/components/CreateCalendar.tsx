import { useState } from 'react';
import { errorText } from '../../../core/errors';
import { createCalendar } from '../api';
import { formatDuration } from '../logic/time.ts';
import type { CalendarMode } from '../logic/windows.ts';
import { MIN_WINDOW_OPTIONS, MODE_TITLES } from './CalendarSettings';

const MODE_HINTS: Record<CalendarMode, string> = {
  free: 'Каждый отмечает, когда он свободен. Приложение покажет время, когда свободны все.',
  busy: 'Каждый отмечает, когда он занят. Приложение покажет время, когда ни у кого нет дел.',
};

// Первое открытие календаря владельцем: выбор режима.
export function CreateCalendar({ groupId, onCreated }: { groupId: string; onCreated: () => void }) {
  const [mode, setMode] = useState<CalendarMode>('free');
  const [minMinutes, setMinMinutes] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createCalendar(groupId, mode, minMinutes);
      onCreated();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="page-title">Календарь группы</h1>
      <p className="hint">Выберите, что будут отмечать участники. Позже режим можно сменить, но отметки при этом удалятся.</p>

      {(['free', 'busy'] as const).map((m) => (
        <button key={m} className={`card choice ${mode === m ? 'chosen' : ''}`} onClick={() => setMode(m)}>
          <div className="form-title">{MODE_TITLES[m]}</div>
          <div className="hint">{MODE_HINTS[m]}</div>
        </button>
      ))}

      <div className="card field">
        <span className="hint">Минимальная длина общего окна</span>
        <select className="input" value={minMinutes} onChange={(e) => setMinMinutes(Number(e.target.value))}>
          {MIN_WINDOW_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m * 60000)}
            </option>
          ))}
        </select>
      </div>

      <button className="button" disabled={busy} onClick={onCreate}>
        {busy ? 'Создаём…' : 'Создать календарь'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
