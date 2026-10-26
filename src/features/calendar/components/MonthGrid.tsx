import { monthTitle } from '../logic/format.ts';
import { addDays, parseDateKey } from '../logic/time.ts';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  year: number;
  month: number;
  selected: string;
  today: string;
  firstDay: string; // первый день календаря
  lastDay: string; // последний день календаря
  windowDays: Set<string>; // дни с общими окнами
  myDays: Set<string>; // дни с моими отметками
  onSelect: (key: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

export function MonthGrid(props: Props) {
  const { year, month, selected, today, firstDay, lastDay, windowDays, myDays } = props;
  const first = `${year}-${pad(month)}-01`;
  // День недели первого числа: 0 — понедельник
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array(offset).fill(null);
  for (let key = first; parseDateKey(key).month === month; key = addDays(key, 1)) cells.push(key);

  const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  const canPrev = `${prev[0]}-${pad(prev[1])}-31` >= firstDay;
  const canNext = `${next[0]}-${pad(next[1])}-01` <= lastDay;

  return (
    <div className="card month">
      <div className="month-header">
        <button
          className="month-nav"
          disabled={!canPrev}
          onClick={() => props.onMonthChange(prev[0], prev[1])}
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <div className="month-title">{monthTitle(year, month)}</div>
        <button
          className="month-nav"
          disabled={!canNext}
          onClick={() => props.onMonthChange(next[0], next[1])}
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>
      <div className="month-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="weekday">
            {d}
          </div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={`empty-${i}`} />;
          const outside = key < firstDay || key > lastDay;
          const classes = [
            'day',
            windowDays.has(key) && 'has-window',
            key === selected && 'selected',
            key === today && 'today',
            key < today && 'past',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={key} className={classes} disabled={outside} onClick={() => props.onSelect(key)}>
              {parseDateKey(key).day}
              {myDays.has(key) && <span className="my-dot" />}
            </button>
          );
        })}
      </div>
      <div className="legend hint">
        <span className="legend-swatch" /> есть общее окно
        <span className="my-dot legend-dot" /> ваши отметки
      </div>
    </div>
  );
}
