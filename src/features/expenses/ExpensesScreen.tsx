import { useState } from 'react';
import { useProfile } from '../../core/auth/AuthProvider';
import { errorText } from '../../core/errors';
import { alertDialog, displayName } from '../../core/telegram/telegram';
import { Avatar } from '../../core/ui/Avatar';
import { useAsync } from '../../core/ui/useAsync';
import { fetchExpensesBundle, setGroupCurrency, type ExpenseMember, type ExpensesBundle } from './api';
import { CurrencySelect } from './components/CurrencySelect';
import { ExpenseForm, type EditableExpense } from './components/ExpenseForm';
import { balances, formatMoney, historyWith, toCents } from './logic/money.ts';
import './expenses.css';

// Данные загружаются при каждом входе в «Траты» и после каждого изменения.
export function ExpensesScreen({ groupId }: { groupId: string }) {
  const [bundle, reload] = useAsync(() => fetchExpensesBundle(groupId), [groupId]);

  if (bundle.status === 'loading') return <p className="hint">Загружаем траты…</p>;
  if (bundle.status === 'error') return <p className="error">{errorText(bundle.error)}</p>;
  if (!bundle.data) return <p className="hint">Группа не найдена или вы в ней больше не состоите.</p>;
  return <ExpensesView groupId={groupId} bundle={bundle.data} reload={reload} />;
}

type View = { kind: 'list' } | { kind: 'person'; member: ExpenseMember } | { kind: 'form'; expense: EditableExpense | null };

function ExpensesView({ groupId, bundle, reload }: { groupId: string; bundle: ExpensesBundle; reload: () => void }) {
  const [profile] = useProfile();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [back, setBack] = useState<View>({ kind: 'list' });

  if (view.kind === 'form') {
    return (
      <ExpenseForm
        groupId={groupId}
        members={bundle.members}
        defaultCurrency={bundle.currency}
        expense={view.expense}
        onDone={() => {
          setView(back);
          reload();
        }}
      />
    );
  }

  if (view.kind === 'person') {
    return (
      <PersonHistory
        bundle={bundle}
        member={view.member}
        onBack={() => setView({ kind: 'list' })}
        onEdit={(expense) => {
          setBack(view);
          setView({ kind: 'form', expense });
        }}
      />
    );
  }

  const totals = balances(bundle.shares, profile.id);
  const others = bundle.members.filter((m) => m.id !== profile.id);

  return (
    <div className="stack">
      <h1 className="page-title">Траты</h1>

      <div className="list">
        {others.length === 0 && <div className="list-item hint">В группе пока нет других участников.</div>}
        {others.map((m) => (
          <button key={m.id} className="list-item person-item" onClick={() => setView({ kind: 'person', member: m })}>
            <Avatar name={displayName(m)} photoUrl={m.photo_url} />
            <div className="grow">
              <BalanceLines name={displayName(m)} byCurrency={totals.get(m.id)} />
            </div>
            <span className="chevron">›</span>
          </button>
        ))}
      </div>

      <button
        className="button"
        onClick={() => {
          setBack({ kind: 'list' });
          setView({ kind: 'form', expense: null });
        }}
      >
        + Создать трату
      </button>
      <p className="hint">
        Вернуть долг — тоже трата: создайте её с названием «Долг» и укажите, кому и сколько вы отдали.
      </p>

      {bundle.ownerId === profile.id && <GroupCurrency groupId={groupId} currency={bundle.currency} onChanged={reload} />}
      {bundle.ownerId !== profile.id && <p className="hint">Валюта группы: {bundle.currency}</p>}
    </div>
  );
}

// «@boris должен(-на) тебе 50 ₽» / «ты должен(-на) @boris 20 €» / «@boris — в расчёте»
function BalanceLines({ name, byCurrency }: { name: string; byCurrency: Map<string, number> | undefined }) {
  if (!byCurrency || byCurrency.size === 0) {
    return (
      <>
        <div>{name}</div>
        <div className="hint">в расчёте</div>
      </>
    );
  }
  const theyOwe = [...byCurrency].filter(([, c]) => c > 0);
  const iOwe = [...byCurrency].filter(([, c]) => c < 0);
  const list = (items: [string, number][]) => items.map(([cur, c]) => formatMoney(Math.abs(c), cur)).join(' и ');
  return (
    <>
      {theyOwe.length > 0 && (
        <div>
          {name} должен(-на) тебе <span className="owed-to-me">{list(theyOwe)}</span>
        </div>
      )}
      {iOwe.length > 0 && (
        <div>
          ты должен(-на) {name} <span className="i-owe">{list(iOwe)}</span>
        </div>
      )}
    </>
  );
}

const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
};

// История трат между мной и одним человеком, новые сверху
function PersonHistory(props: {
  bundle: ExpensesBundle;
  member: ExpenseMember;
  onBack: () => void;
  onEdit: (expense: EditableExpense) => void;
}) {
  const { bundle, member } = props;
  const [profile] = useProfile();
  const name = displayName(member);
  const entries = historyWith(bundle.shares, profile.id, member.id);
  const totals = balances(bundle.shares, profile.id).get(member.id);

  // Свою трату можно открыть и изменить — собираем её целиком (все доли видны автору)
  function edit(expenseId: string) {
    const all = bundle.shares.filter((s) => s.expense_id === expenseId && s.payer_id === profile.id);
    if (all.length === 0) return;
    props.onEdit({
      id: expenseId,
      title: all[0].title,
      currency: all[0].currency,
      spent_on: all[0].spent_on,
      shares: all.map((s) => ({ debtor_id: s.debtor_id, cents: toCents(s.amount) })),
    });
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="text-button" onClick={props.onBack}>
          ‹ Все участники
        </button>
      </div>
      <div className="card row">
        <Avatar name={name} photoUrl={member.photo_url} />
        <div className="grow">
          <BalanceLines name={name} byCurrency={totals} />
        </div>
      </div>

      <h2 className="section-title">История</h2>
      <div className="list">
        {entries.length === 0 && <div className="list-item hint">Между вами пока не было трат.</div>}
        {entries.map((e) => (
          <button
            key={e.expense_id}
            className="list-item person-item"
            onClick={() => (e.paidByMe ? edit(e.expense_id) : alertDialog('Изменить эту трату может только тот, кто её записал.'))}
          >
            <div className="grow">
              <div>{e.title || 'Без названия'}</div>
              <div className="hint">
                {shortDate(e.spent_on)} · {e.paidByMe ? `платил(а) ты, ${name} должен(-на)` : `платил(а) ${name}, ты должен(-на)`}
              </div>
            </div>
            <div className={e.paidByMe ? 'owed-to-me' : 'i-owe'}>
              {e.paidByMe ? '+' : '−'}
              {formatMoney(e.cents, e.currency)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function GroupCurrency({ groupId, currency, onChanged }: { groupId: string; currency: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card field">
      <span className="hint">Валюта группы (для новых трат по умолчанию)</span>
      <CurrencySelect
        value={currency}
        disabled={busy}
        onChange={async (code) => {
          setBusy(true);
          try {
            await setGroupCurrency(groupId, code);
            onChanged();
          } catch (err) {
            await alertDialog(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
