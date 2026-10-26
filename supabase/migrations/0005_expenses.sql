-- =====================================================================
-- Функция «Траты»: кто кому сколько должен внутри группы.
--
-- Трату записывает тот, кто платил (payer). Доли (expense_shares) —
-- кто сколько ему должен по этой трате. Итог между двумя людьми
-- приложение считает по долям в обе стороны, отдельно по каждой валюте.
-- Возврат долга — обычная трата в обратную сторону.
--
-- Приватность: долю видят только двое — кто платил и кто должен.
-- Трату (название, дату) видят её автор и те, у кого в ней есть доля.
--
-- Выйти из группы (или быть удалённым), пока есть незакрытые долги, нельзя.
-- =====================================================================


-- ---------- Таблицы ----------

-- Валюта группы по умолчанию (меняет владелец). Нет строки — рубли.
create table public.expense_settings (
  group_id uuid primary key references public.groups (id) on delete cascade,
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$')
);

create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  payer_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 100),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  spent_on   date not null default current_date,
  created_at timestamptz not null default now()
);

create index expenses_group_id_idx on public.expenses (group_id);

-- group_id, payer_id и currency повторяют трату: так правила доступа
-- и подсчёт итогов не требуют лишних соединений. Записываются только функциями ниже.
create table public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  payer_id   uuid not null references public.profiles (id) on delete cascade,
  debtor_id  uuid not null references public.profiles (id) on delete cascade,
  currency   text not null,
  amount     numeric(14, 2) not null check (amount > 0),
  primary key (expense_id, debtor_id),
  check (debtor_id <> payer_id)
);

create index expense_shares_group_payer_idx on public.expense_shares (group_id, payer_id);
create index expense_shares_group_debtor_idx on public.expense_shares (group_id, debtor_id);


-- ---------- Проверки для правил доступа ----------

create function public.is_expense_debtor(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expense_shares
    where expense_id = p_expense_id and debtor_id = auth.uid()
  );
$$;


-- ---------- Создание, изменение, удаление ----------

-- Доли приходят списком [{"debtor_id": "...", "amount": 100.50}, ...].
-- Проверяет, что все — участники группы, не сам плательщик, суммы положительные.
create function public.expenses_write_shares(
  p_expense_id uuid,
  p_group_id   uuid,
  p_currency   text,
  p_shares     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'INVALID_SHARES';
  end if;

  insert into public.expense_shares (expense_id, group_id, payer_id, debtor_id, currency, amount)
  select p_expense_id, p_group_id, auth.uid(), s.debtor_id, p_currency, s.amount
  from jsonb_to_recordset(p_shares) as s (debtor_id uuid, amount numeric)
  where exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = s.debtor_id
  );

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_shares) then
    raise exception 'INVALID_SHARES';
  end if;
end;
$$;

create function public.create_expense(
  p_group_id uuid,
  p_title    text,
  p_currency text,
  p_spent_on date,
  p_shares   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'NOT_MEMBER';
  end if;

  insert into public.expenses (group_id, payer_id, title, currency, spent_on)
  values (p_group_id, auth.uid(), btrim(coalesce(p_title, '')), p_currency, p_spent_on)
  returning id into v_id;

  perform public.expenses_write_shares(v_id, p_group_id, p_currency, p_shares);
  return v_id;
end;
$$;

-- Изменить может только автор: трата и доли заменяются целиком.
create function public.update_expense(
  p_expense_id uuid,
  p_title      text,
  p_currency   text,
  p_spent_on   date,
  p_shares     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id
  from public.expenses
  where id = p_expense_id and payer_id = auth.uid();
  if v_group_id is null or not public.is_group_member(v_group_id) then
    raise exception 'NOT_AUTHOR';
  end if;

  update public.expenses
  set title = btrim(coalesce(p_title, '')), currency = p_currency, spent_on = p_spent_on
  where id = p_expense_id;

  delete from public.expense_shares where expense_id = p_expense_id;
  perform public.expenses_write_shares(p_expense_id, v_group_id, p_currency, p_shares);
end;
$$;

create function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.expenses where id = p_expense_id and payer_id = auth.uid();
  if not found then
    raise exception 'NOT_AUTHOR';
  end if;
end;
$$;

create function public.set_group_currency(p_group_id uuid, p_currency text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;

  insert into public.expense_settings (group_id, currency)
  values (p_group_id, p_currency)
  on conflict (group_id) do update set currency = excluded.currency;
end;
$$;


-- ---------- Нельзя уйти из группы с незакрытыми долгами ----------
-- Срабатывает при выходе и при удалении участника владельцем.
-- pg_trigger_depth() = 1 — удаление вызвано напрямую (leave_group, remove_member),
-- а не каскадом при удалении аккаунта администратором.

create function public.expenses_block_leave_with_debts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and exists (
    select 1
    from public.expense_shares
    where group_id = old.group_id
      and (payer_id = old.user_id or debtor_id = old.user_id)
    group by currency, case when payer_id = old.user_id then debtor_id else payer_id end
    having sum(case when payer_id = old.user_id then amount else -amount end) <> 0
  ) then
    raise exception 'UNSETTLED_DEBTS';
  end if;
  return old;
end;
$$;

create trigger group_members_before_delete_expenses
  before delete on public.group_members
  for each row execute function public.expenses_block_leave_with_debts();


-- ---------- Права доступа ----------

revoke all on public.expense_settings, public.expenses, public.expense_shares from anon, authenticated;
grant select on public.expense_settings, public.expenses, public.expense_shares to authenticated;

alter table public.expense_settings enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_shares   enable row level security;

create policy "Валюту группы видят участники"
  on public.expense_settings for select to authenticated
  using (public.is_group_member(group_id));

-- Только пока человек в группе: вышедший больше не видит трат этой группы.
create policy "Трату видят автор и те, кто по ней должен"
  on public.expenses for select to authenticated
  using ((payer_id = auth.uid() or public.is_expense_debtor(id)) and public.is_group_member(group_id));

create policy "Долю видят только двое: кто платил и кто должен"
  on public.expense_shares for select to authenticated
  using ((payer_id = auth.uid() or debtor_id = auth.uid()) and public.is_group_member(group_id));

revoke execute on function
  public.is_expense_debtor(uuid),
  public.expenses_write_shares(uuid, uuid, text, jsonb),
  public.create_expense(uuid, text, text, date, jsonb),
  public.update_expense(uuid, text, text, date, jsonb),
  public.delete_expense(uuid),
  public.set_group_currency(uuid, text),
  public.expenses_block_leave_with_debts()
from public, anon;

grant execute on function
  public.is_expense_debtor(uuid),
  public.create_expense(uuid, text, text, date, jsonb),
  public.update_expense(uuid, text, text, date, jsonb),
  public.delete_expense(uuid),
  public.set_group_currency(uuid, text)
to authenticated;
