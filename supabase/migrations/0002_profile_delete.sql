-- =====================================================================
-- Удаление аккаунта владельца группы.
--
-- Раньше удаление профиля владельца падало: проверка «у группы есть
-- владелец» срабатывала раньше, чем права успевали перейти другому.
-- Теперь перед удалением профиля человек сначала выходит из всех групп
-- по обычным правилам: права переходят тому, кто дольше всех в группе,
-- а опустевшая группа удаляется.
-- =====================================================================

create function public.handle_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.group_members where user_id = old.id;
  return old;
end;
$$;

create trigger profiles_before_delete
  before delete on public.profiles
  for each row execute function public.handle_profile_deleted();

revoke execute on function public.handle_profile_deleted() from public, anon, authenticated;
