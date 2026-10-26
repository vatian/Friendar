-- =====================================================================
-- Функция «Календарь»: общий календарь группы.
--
-- Один календарь на группу. Режим:
--   free — участники отмечают, когда свободны;
--   busy — участники отмечают, когда заняты.
-- Результат (общие окна) считает приложение по загруженным отметкам.
--
-- Отметка хранится как точный момент начала и конца (timestamptz)
-- плюс часовой пояс, в котором её ввели, — чтобы показать «по Екатеринбургу».
--
-- Ночь задаёт владелец правилами. Для каждой даты действует самое свежее
-- правило, в период которого она попадает (пустые границы — без ограничения).
-- Правило запоминает часовой пояс владельца на момент создания.
-- =====================================================================


-- ---------- Таблицы ----------

create table public.calendars (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null unique references public.groups (id) on delete cascade,
  mode               text not null check (mode in ('free', 'busy')),
  min_window_minutes int  not null default 120
                     check (min_window_minutes between 30 and 720 and min_window_minutes % 30 = 0),
  starts_on          date not null default current_date,
  ends_on            date not null default date '2030-12-31',
  created_at         timestamptz not null default now()
);

create table public.calendar_slots (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  timezone    text not null check (public.is_valid_timezone(timezone)),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index calendar_slots_calendar_id_idx on public.calendar_slots (calendar_id);

create table public.calendar_night_rules (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars (id) on delete cascade,
  enabled      boolean not null,
  night_start  time,
  night_end    time,
  timezone     text not null check (public.is_valid_timezone(timezone)),
  applies_from date,
  applies_to   date,
  -- clock_timestamp: у правил, созданных подряд, время точно разное
  created_at   timestamptz not null default clock_timestamp(),
  check (not enabled or (night_start is not null and night_end is not null and night_start <> night_end)),
  check (applies_from is null or applies_to is null or applies_from <= applies_to)
);

create index calendar_night_rules_calendar_id_idx on public.calendar_night_rules (calendar_id);


-- ---------- Проверки для правил доступа ----------

create function public.is_calendar_member(p_calendar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.calendars c
    join public.group_members m on m.group_id = c.group_id
    where c.id = p_calendar_id and m.user_id = auth.uid()
  );
$$;

create function public.is_calendar_owner(p_calendar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.calendars c
    join public.groups g on g.id = c.group_id
    where c.id = p_calendar_id and g.owner_id = auth.uid()
  );
$$;


-- ---------- Действия владельца ----------

create function public.create_calendar(p_group_id uuid, p_mode text, p_min_window_minutes int default 120)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;
  if exists (select 1 from public.calendars where group_id = p_group_id) then
    raise exception 'CALENDAR_EXISTS';
  end if;

  insert into public.calendars (group_id, mode, min_window_minutes)
  values (p_group_id, p_mode, p_min_window_minutes)
  returning id into v_id;

  return v_id;
end;
$$;

-- Смена режима удаляет все отметки: их смысл меняется на противоположный.
create function public.set_calendar_mode(p_calendar_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_calendar_owner(p_calendar_id) then
    raise exception 'NOT_OWNER';
  end if;

  if exists (select 1 from public.calendars where id = p_calendar_id and mode <> p_mode) then
    delete from public.calendar_slots where calendar_id = p_calendar_id;
    update public.calendars set mode = p_mode where id = p_calendar_id;
  end if;
end;
$$;

create function public.set_min_window(p_calendar_id uuid, p_minutes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_calendar_owner(p_calendar_id) then
    raise exception 'NOT_OWNER';
  end if;

  update public.calendars set min_window_minutes = p_minutes where id = p_calendar_id;
end;
$$;

-- Новое правило ночи. Часовой пояс — текущий пояс владельца из профиля.
create function public.add_night_rule(
  p_calendar_id uuid,
  p_enabled     boolean,
  p_night_start time,
  p_night_end   time,
  p_from        date,
  p_to          date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_calendar_owner(p_calendar_id) then
    raise exception 'NOT_OWNER';
  end if;

  insert into public.calendar_night_rules
    (calendar_id, enabled, night_start, night_end, timezone, applies_from, applies_to)
  values (
    p_calendar_id, p_enabled, p_night_start, p_night_end,
    (select timezone from public.profiles where id = auth.uid()),
    p_from, p_to
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- ---------- Ушёл из группы — его отметки больше не учитываются ----------

create function public.calendar_handle_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.calendar_slots s
  using public.calendars c
  where s.calendar_id = c.id
    and c.group_id = old.group_id
    and s.user_id = old.user_id;
  return null;
end;
$$;

create trigger group_members_after_delete_calendar
  after delete on public.group_members
  for each row execute function public.calendar_handle_member_left();


-- ---------- Права доступа ----------

revoke all on public.calendars, public.calendar_slots, public.calendar_night_rules
  from anon, authenticated;

grant select on public.calendars, public.calendar_slots, public.calendar_night_rules to authenticated;
-- Свои отметки участник меняет напрямую; календарь и ночь — только через функции выше.
grant insert (calendar_id, starts_at, ends_at, timezone) on public.calendar_slots to authenticated;
grant update (starts_at, ends_at, timezone) on public.calendar_slots to authenticated;
grant delete on public.calendar_slots to authenticated;

alter table public.calendars            enable row level security;
alter table public.calendar_slots       enable row level security;
alter table public.calendar_night_rules enable row level security;

create policy "Календарь видят участники группы"
  on public.calendars for select to authenticated
  using (public.is_group_member(group_id));

create policy "Отметки видят участники группы"
  on public.calendar_slots for select to authenticated
  using (public.is_calendar_member(calendar_id));

create policy "Добавлять можно только свои отметки"
  on public.calendar_slots for insert to authenticated
  with check (user_id = auth.uid() and public.is_calendar_member(calendar_id));

create policy "Менять можно только свои отметки"
  on public.calendar_slots for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Удалять можно только свои отметки"
  on public.calendar_slots for delete to authenticated
  using (user_id = auth.uid());

create policy "Правила ночи видят участники группы"
  on public.calendar_night_rules for select to authenticated
  using (public.is_calendar_member(calendar_id));

revoke execute on function
  public.is_calendar_member(uuid),
  public.is_calendar_owner(uuid),
  public.create_calendar(uuid, text, int),
  public.set_calendar_mode(uuid, text),
  public.set_min_window(uuid, int),
  public.add_night_rule(uuid, boolean, time, time, date, date),
  public.calendar_handle_member_left()
from public, anon;

grant execute on function
  public.is_calendar_member(uuid),
  public.is_calendar_owner(uuid),
  public.create_calendar(uuid, text, int),
  public.set_calendar_mode(uuid, text),
  public.set_min_window(uuid, int),
  public.add_night_rule(uuid, boolean, time, time, date, date)
to authenticated;


-- ---------- Живое обновление (Supabase Realtime) ----------
-- Приложение подписывается на изменения и перезагружает календарь,
-- вместо того чтобы постоянно опрашивать сервер.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.calendars, public.calendar_slots, public.calendar_night_rules;
  end if;
end;
$$;
