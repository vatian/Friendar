import { supabase } from '../supabase/client';

// Все изменения идут через функции в базе (create_group и др.):
// они сами проверяют права и лимиты. Здесь — только тонкие обёртки.

export const MAX_GROUPS_PER_USER = 2;
export const MAX_MEMBERS_PER_GROUP = 6;

export interface GroupSummary {
  id: string;
  name: string;
  owner_id: string;
  member_count: number;
}

export interface Member {
  id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  joined_at: string;
}

export interface GroupDetails {
  id: string;
  name: string;
  owner_id: string;
  members: Member[];
}

// Список моих групп — один запрос (чужие группы база не отдаст).
export async function fetchMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, owner_id, created_at, group_members(count)')
    .order('created_at');
  if (error) throw error;
  return data.map((g) => ({
    id: g.id,
    name: g.name,
    owner_id: g.owner_id,
    member_count: g.group_members[0]?.count ?? 0,
  }));
}

// Группа вместе с участниками и их профилями — один запрос.
export async function fetchGroup(groupId: string): Promise<GroupDetails | null> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      'id, name, owner_id, group_members(joined_at, profiles(id, username, first_name, photo_url))',
    )
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // profiles — один объект (у участника один профиль), уточняем тип вручную
  const rows = data.group_members as unknown as {
    joined_at: string;
    profiles: Omit<Member, 'joined_at'> | null;
  }[];
  const members: Member[] = rows
    .flatMap((m) => (m.profiles ? [{ ...m.profiles, joined_at: m.joined_at }] : []))
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

  return { id: data.id, name: data.name, owner_id: data.owner_id, members };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const createGroup = (name: string) => rpc<string>('create_group', { p_name: name });
export const joinGroup = (code: string) => rpc<string>('join_group', { p_invite_code: code });
export const leaveGroup = (groupId: string) => rpc<void>('leave_group', { p_group_id: groupId });
export const removeMember = (groupId: string, userId: string) =>
  rpc<void>('remove_member', { p_group_id: groupId, p_user_id: userId });
export const renameGroup = (groupId: string, name: string) =>
  rpc<void>('rename_group', { p_group_id: groupId, p_name: name });
export const getInviteCode = (groupId: string) =>
  rpc<string>('get_invite_code', { p_group_id: groupId });
export const regenerateInviteCode = (groupId: string) =>
  rpc<string>('regenerate_invite_code', { p_group_id: groupId });
