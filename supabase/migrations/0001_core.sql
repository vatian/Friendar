-- =====================================================================
-- Friendar — ядро: пользователи, группы, участники.
-- Таблицы функций (календарь и др.) живут в своих миграциях
-- и ссылаются на public.groups.
--
-- Правила доступа:
--   * читать данные группы могут только её участники (RLS);
--   * все изменения групп и участников — только через функции ниже,
--     которые сами проверяют права и лимиты;
--   * лимиты «6 человек в группе» и «2 группы на человека»
--     проверяет триггер в базе, обойти их из приложения нельзя.
--
-- Ошибки возвращаются кодами (GROUP_FULL и т. п.), а приложение
-- переводит их в понятный русский текст.
-- =====================================================================


-- ---------- Вспомогательное ----------

create function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

create function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;


-- ---------- Пользователи ----------
-- Строку создаёт и обновляет функция входа (Edge Function telegram-auth)
-- при каждом входе: так ник и имя всегда актуальны.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint not null unique,
  username    text,
  first_name  text not null,
  last_name   text,
  photo_url   text,
  timezone    text not null default 'Europe/Moscow'
              check (public.is_valid_timezone(timezone)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ---------- Группы ----------
-- Владелец хранится только здесь (owner_id), отдельной роли у участника нет.

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 64),
  owner_id    uuid not null references public.profiles (id),
  invite_code text not null unique default public.generate_invite_code(),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id);


-- ---------- Проверки для правил доступа ----------
-- security definer: функции читают group_members в обход RLS,
-- иначе правило для group_members ссылалось бы само на себя.

create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = auth.uid()
  );
$$;

-- Есть ли у текущего пользователя общая группа с этим человеком
create function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs using (group_id)
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;


-- ---------- Лимиты: 6 участников в группе, 2 группы на человека ----------

create function public.enforce_membership_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Блокируем строки группы и пользователя, чтобы одновременные
  -- вступления выстраивались в очередь и не обошли лимит.
  perform 1 from public.groups where id = new.group_id for update;
  perform 1 from public.profiles where id = new.user_id for update;

  if (select count(*) from public.group_members where group_id = new.group_id) >= 6 then
    raise exception 'GROUP_FULL';
  end if;

  if (select count(*) from public.group_members where user_id = new.user_id) >= 2 then
    raise exception 'TOO_MANY_GROUPS';
  end if;

  return new;
end;
$$;

create trigger group_members_limits
  before insert on public.group_members
  for each row execute function public.enforce_membership_limits();


-- ---------- Выход владельца ----------
-- Если ушёл владелец, права переходят тому, кто дольше всех в группе.
-- Если ушёл последний участник, группа удаляется вместе с данными функций.

create function public.handle_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_owner uuid;
begin
  if exists (
    select 1 from public.groups
    where id = old.group_id and owner_id = old.user_id
  ) then
    select user_id into v_next_owner
    from public.group_members
    where group_id = old.group_id
    order by joined_at, user_id
    limit 1;

    if v_next_owner is null then
      delete from public.groups where id = old.group_id;
    else
      update public.groups set owner_id = v_next_owner where id = old.group_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger group_members_after_delete
  after delete on public.group_members
  for each row execute function public.handle_member_left();


-- ---------- Действия с группами (вызываются из приложения) ----------

create function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.groups (name, owner_id)
  values (btrim(p_name), auth.uid())
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, auth.uid());

  return v_group_id;
end;
$$;

create function public.join_group(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id into v_group_id from public.groups where invite_code = p_invite_code;
  if v_group_id is null then
    raise exception 'INVALID_INVITE';
  end if;

  -- Уже в группе — просто открываем её
  if exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = auth.uid()
  ) then
    return v_group_id;
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, auth.uid());

  return v_group_id;
end;
$$;

create function public.leave_group(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
$$;

create function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;

  update public.groups set name = btrim(p_name) where id = p_group_id;
end;
$$;

-- Код приглашения видит только владелец
create function public.get_invite_code(p_group_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;

  return (select invite_code from public.groups where id = p_group_id);
end;
$$;

-- Новый код: старая ссылка-приглашение перестаёт работать
create function public.regenerate_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;

  update public.groups
  set invite_code = public.generate_invite_code()
  where id = p_group_id
  returning invite_code into v_code;

  return v_code;
end;
$$;


-- ---------- Права доступа ----------
-- Сначала убираем всё, что Supabase выдаёт по умолчанию, затем выдаём
-- только нужное. Анонимные посетители (anon) не получают ничего.

revoke all on public.profiles, public.groups, public.group_members from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (timezone, updated_at) on public.profiles to authenticated;
-- invite_code не выдаём: его отдаёт только get_invite_code() владельцу
grant select (id, name, owner_id, created_at) on public.groups to authenticated;
grant select on public.group_members to authenticated;

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

create policy "Свой профиль и профили участников общих групп"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

create policy "Менять можно только свой профиль"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Группу видят только участники"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "Состав группы видят только участники"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- Функции: по умолчанию их может вызвать кто угодно — закрываем.
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.is_valid_timezone(text),
  public.is_group_member(uuid),
  public.is_group_owner(uuid),
  public.shares_group_with(uuid),
  public.create_group(text),
  public.join_group(text),
  public.leave_group(uuid),
  public.remove_member(uuid, uuid),
  public.rename_group(uuid, text),
  public.get_invite_code(uuid),
  public.regenerate_invite_code(uuid)
to authenticated;
