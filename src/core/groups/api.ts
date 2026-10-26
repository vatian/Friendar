import { supabase } from '../supabase/client';
import { MEMBERS_SELECT, parseMembers, type GroupMember } from './members';

// Все изменения идут через функции в базе (create_group и др.):
// они сами проверяют права и лимиты. Здесь — только тонкие обёртки.

// Лимиты — те же, что проверяет база (0006_premium.sql)
export const groupsLimit = (premium: boolean) => (premium ? 10 : 2);
export const membersLimit = (ownerPremium: boolean) => (ownerPremium ? 15 : 6);

export interface GroupSummary {
  id: string;
  name: string;
  owner_id: string;
  owner_premium: boolean;
  member_count: number;
}

export type Member = GroupMember;

export interface GroupDetails {
  id: string;
  name: string;
  owner_id: string;
  accent_color: string | null;
  members: Member[];
}

// Список моих групп — один запрос (чужие группы база не отдаст).
export async function fetchMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, owner_id, created_at, owner:profiles!groups_owner_id_fkey(premium_since), group_members(count)')
    .order('created_at');
  if (error) throw error;
  const rows = data as unknown as {
    id: string;
    name: string;
    owner_id: string;
    owner: { premium_since: string | null } | null;
    group_members: { count: number }[];
  }[];
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    owner_id: g.owner_id,
    owner_premium: Boolean(g.owner?.premium_since),
    member_count: g.group_members[0]?.count ?? 0,
  }));
}

// Группа вместе с участниками и их именами — один запрос.
export async function fetchGroup(groupId: string): Promise<GroupDetails | null> {
  const { data, error } = await supabase
    .from('groups')
    .select(`id, name, owner_id, accent_color, ${MEMBERS_SELECT}`)
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    owner_id: data.owner_id,
    accent_color: data.accent_color,
    members: parseMembers(data.group_members),
  };
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

// Премиум-владелец: имя участника в этой группе (пустое — сбросить) и цвет кнопок группы
export const setMemberName = (groupId: string, userId: string, name: string | null) =>
  rpc<void>('set_member_name', { p_group_id: groupId, p_user_id: userId, p_name: name });
export const setGroupColor = (groupId: string, color: string | null) =>
  rpc<void>('set_group_color', { p_group_id: groupId, p_color: color });
