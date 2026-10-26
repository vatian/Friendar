import { useState, type FormEvent } from 'react';
import { useProfile } from '../../../core/auth/AuthProvider';
import { errorText } from '../../../core/errors';
import { confirmDialog, displayName } from '../../../core/telegram/telegram';
import { Avatar } from '../../../core/ui/Avatar';
import { createExpense, deleteExpense, updateExpense, type ExpenseMember } from '../api';
import { centsToInput, formatMoney, parseAmount, splitEvenly } from '../logic/money.ts';
import { CurrencySelect } from './CurrencySelect';

type Mode = 'even' | 'each';

// Существующая трата для редактирования (только своя)
export interface EditableExpense {
  id: string;
  title: string;
  currency: string;
  spent_on: string;
  shares: { debtor_id: string; cents: number }[];
}

interface Props {
  groupId: string;
  members: ExpenseMember[];
  defaultCurrency: string;
  expense: EditableExpense | null;
  onDone: () => void;
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Трату записывает тот, кто платил. «Поровну» — сумма делится на отмеченных,
// включая меня (моя часть — не долг). «Разные суммы» — у каждого своя сумма.
export function ExpenseForm({ groupId, members, defaultCurrency, expense, onDone }: Props) {
  const [profile] = useProfile();
  const others = members.filter((m) => m.id !== profile.id);

  const [title, setTitle] = useState(expense?.title ?? '');
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? todayKey());
  const [currency, setCurrency] = useState(expense?.currency ?? defaultCurrency);
  const [mode, setMode] = useState<Mode>(expense ? 'each' : 'even');
  const [total, setTotal] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(expense ? [] : [profile.id, ...others.map((m) => m.id)]),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((expense?.shares ?? []).map((s) => [s.debtor_id, centsToInput(s.cents)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Итоговые доли (кто сколько мне должен) по текущему вводу
  let shares: { debtor_id: string; cents: number }[] = [];
  const evenParts = new Map<string, number>(); // для «Поровну»: часть каждого, включая мою
  let problem: string | null = null;
  if (mode === 'even') {
    const totalCents = parseAmount(total);
    const people = [profile.id, ...others.map((m) => m.id)].filter((id) => chosen.has(id));
    if (total && totalCents === null) problem = 'Введите сумму числом, например 1500 или 99,90.';
    else if (people.length < 2) problem = 'Отметьте хотя бы одного участника, кроме себя.';
    else if (totalCents !== null) {
      const parts = splitEvenly(totalCents, people.length);
      people.forEach((id, i) => evenParts.set(id, parts[i]));
      shares = people
        .filter((id) => id !== profile.id)
        .map((id) => ({ debtor_id: id, cents: evenParts.get(id)! }));
    }
  } else {
    for (const m of others) {
      const raw = amounts[m.id]?.trim();
      if (!raw) continue;
      const cents = parseAmount(raw);
      if (cents === null) problem = `Сумма для ${displayName(m)} — числом, например 300 или 99,90.`;
      else shares.push({ debtor_id: m.id, cents });
    }
  }
  const valid = !problem && shares.length > 0 && !!spentOn;

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
    if (!valid) return;
    setBusy(true);
    setError(null);
    const input = { title: title.trim(), currency, spent_on: spentOn, shares };
    try {
      if (expense) await updateExpense(expense.id, input);
      else await createExpense(groupId, input);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!expense || !(await confirmDialog('Удалить эту трату? Долги по ней пересчитаются.'))) return;
    setBusy(true);
    try {
      await deleteExpense(expense.id);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h1 className="page-title">{expense ? 'Изменить трату' : 'Новая трата'}</h1>
      <p className="hint">Вы платили — отметьте, кто и сколько вам должен.</p>

      <div className="card stack">
        <div className="field">
          <span className="hint">За что</span>
          <input
            className="input"
            maxLength={100}
            placeholder="Например, «Ужин» или «Долг»"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="row">
          <div className="field grow">
            <span className="hint">Дата</span>
            <input type="date" className="input" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="hint">Валюта</span>
          <CurrencySelect value={currency} onChange={setCurrency} />
          {currency !== defaultCurrency && (
            <span className="hint">Валюта группы — {defaultCurrency}. Эта трата будет в {currency}.</span>
          )}
        </div>
      </div>

      <div className="segmented">
        <button type="button" className={mode === 'even' ? 'active' : ''} onClick={() => setMode('even')}>
          Поровну
        </button>
        <button type="button" className={mode === 'each' ? 'active' : ''} onClick={() => setMode('each')}>
          Разные суммы
        </button>
      </div>

      {mode === 'even' ? (
        <div className="card stack">
          <div className="field">
            <span className="hint">Общая сумма</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <span className="hint">Делится на отмеченных:</span>
          {[profile, ...others].map((m) => {
            const part = evenParts.get(m.id);
            return (
              <label key={m.id} className="row">
                <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                <Avatar name={displayName(m)} photoUrl={m.photo_url} />
                <span className="grow">{m.id === profile.id ? 'Я' : displayName(m)}</span>
                <span className="hint">{part !== undefined ? formatMoney(part, currency) : ''}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="card stack">
          {others.length === 0 && <p className="hint">В группе пока нет других участников.</p>}
          {others.map((m) => (
            <div key={m.id} className="row">
              <Avatar name={displayName(m)} photoUrl={m.photo_url} />
              <span className="grow">{displayName(m)}</span>
              <input
                className="input amount-input"
                inputMode="decimal"
                placeholder="0"
                value={amounts[m.id] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [m.id]: e.target.value }))}
              />
            </div>
          ))}
          <span className="hint">Пустое поле — этот человек ничего не должен.</span>
        </div>
      )}

      {problem && <p className="error">{problem}</p>}
      {error && <p className="error">{error}</p>}
      {valid && (
        <p className="hint">
          Вам будут должны: {formatMoney(shares.reduce((sum, s) => sum + s.cents, 0), currency)}
        </p>
      )}

      <button className="button" disabled={!valid || busy}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <div className="row">
        <button type="button" className="button secondary" onClick={onDone} disabled={busy}>
          Отмена
        </button>
        {expense && (
          <button type="button" className="button secondary danger" onClick={onDelete} disabled={busy}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
