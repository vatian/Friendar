-- =====================================================================
-- Премиум «навсегда».
--
-- Активируется промокодом. Сами коды в репозитории НЕ хранятся:
-- в таблицу promo_codes попадает только их хеш, и вносится он
-- напрямую в базу, минуя файлы проекта.
--
-- Что даёт премиум:
--   * состоять до 10 групп (обычно 2);
--   * в группах, где он владелец, — до 15 участников (обычно 6);
--   * своё имя вместо ника;
--   * владельцу — имена участников в своей группе и цвет кнопок группы.
--
-- Какое имя показывать: имя от владельца в этой группе → своё имя → @ник → имя в Telegram.
-- =====================================================================


-- ---------- Профиль ----------

alter table public.profiles
  add column premium_since timestamptz,
  add column custom_name   text check (char_length(btrim(custom_name)) between 1 and 32);

create function public.is_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and premium_since is not null);
$$;


-- ---------- Промокоды ----------

create table public.promo_codes (
  code_hash text primary key, -- sha256 кода в верхнем регистре, hex
  active    boolean not null default true
);

-- Попытки ввода — чтобы код нельзя было подобрать перебором
create table public.promo_attempts (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index promo_attempts_user_idx on public.promo_attempts (user_id, attempted_at);

alter table public.promo_codes    enable row level security;
alter table public.promo_attempts enable row level security;
revoke all on public.promo_codes, public.promo_attempts from anon, authenticated;

-- true — премиум активирован (или уже был), false — неверный код.
-- Не больше 5 попыток за 10 минут.
create function public.redeem_promo(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if (
    select count(*) from public.promo_attempts
    where user_id = auth.uid() and attempted_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;
  insert into public.promo_attempts (user_id) values (auth.uid());

  if not exists (
    select 1 from public.promo_codes
    where active
      and code_hash = encode(sha256(convert_to(upper(btrim(p_code)), 'UTF8')), 'hex')
  ) then
    return false;
  end if;

  update public.profiles set premium_since = coalesce(premium_since, now()) where id = auth.uid();
  return true;
end;
$$;


-- ---------- Своё имя ----------

-- null или пустая строка — вернуть ник
create function public.set_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_premium(auth.uid()) then
    raise exception 'NOT_PREMIUM';
  end if;
  update public.profiles
  set custom_name = nullif(btrim(coalesce(p_name, '')), ''), updated_at = now()
  where id = auth.uid();
end;
$$;


-- ---------- Имена участников в группе ----------
-- Удаляются вместе с участием в группе (вышел — имя пропало).

create table public.group_member_names (
  group_id uuid not null,
  user_id  uuid not null,
  name     text not null check (char_length(btrim(name)) between 1 and 32),
  primary key (group_id, user_id),
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);

alter table public.group_member_names enable row level security;
revoke all on public.group_member_names from anon, authenticated;
grant select on public.group_member_names to authenticated;

create policy "Имена в группе видят её участники"
  on public.group_member_names for select to authenticated
  using (public.is_group_member(group_id));

create function public.set_member_name(p_group_id uuid, p_user_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;
  if not public.is_premium(auth.uid()) then
    raise exception 'NOT_PREMIUM';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    delete from public.group_member_names where group_id = p_group_id and user_id = p_user_id;
  else
    insert into public.group_member_names (group_id, user_id, name)
    values (p_group_id, p_user_id, btrim(p_name))
    on conflict (group_id, user_id) do update set name = excluded.name;
  end if;
end;
$$;


-- ---------- Цвет кнопок группы ----------

alter table public.groups
  add column accent_color text check (accent_color in (
    '#2481cc', '#2e9e5b', '#0f9d9a', '#7b5cd6', '#d6488f',
    '#e04f5f', '#e8833a', '#a0703c', '#5b6573', '#1f6feb'
  ));

grant select (accent_color) on public.groups to authenticated;

-- null — цвет темы Telegram
create function public.set_group_color(p_group_id uuid, p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'NOT_OWNER';
  end if;
  if not public.is_premium(auth.uid()) then
    raise exception 'NOT_PREMIUM';
  end if;
  update public.groups set accent_color = p_color where id = p_group_id;
end;
$$;


-- ---------- Лимиты с учётом премиума ----------
-- Вместимость группы — по премиуму её ТЕКУЩЕГО владельца.
-- Если премиум-владелец ушёл, никого не выгоняем: просто новые не вступят,
-- пока участников не станет меньше 6.

create or replace function public.enforce_membership_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- Блокируем строки группы и пользователя, чтобы одновременные
  -- вступления выстраивались в очередь и не обошли лимит.
  select owner_id into v_owner from public.groups where id = new.group_id for update;
  perform 1 from public.profiles where id = new.user_id for update;

  if (select count(*) from public.group_members where group_id = new.group_id)
     >= (case when public.is_premium(v_owner) then 15 else 6 end) then
    raise exception 'GROUP_FULL';
  end if;

  if (select count(*) from public.group_members where user_id = new.user_id)
     >= (case when public.is_premium(new.user_id) then 10 else 2 end) then
    raise exception 'TOO_MANY_GROUPS';
  end if;

  return new;
end;
$$;


-- ---------- Права на функции ----------

revoke execute on function
  public.is_premium(uuid),
  public.redeem_promo(text),
  public.set_my_name(text),
  public.set_member_name(uuid, uuid, text),
  public.set_group_color(uuid, text)
from public, anon;

grant execute on function
  public.is_premium(uuid),
  public.redeem_promo(text),
  public.set_my_name(text),
  public.set_member_name(uuid, uuid, text),
  public.set_group_color(uuid, text)
to authenticated;
