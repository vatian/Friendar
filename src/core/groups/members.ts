// Участники группы с тем, что нужно для имени: ник, своё имя, ⭐, имя от владельца в группе.
// Используется ядром и функциями (календарь, траты) — так имена везде одинаковые.

export interface GroupMember {
  id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  custom_name: string | null;
  premium_since: string | null;
  group_name: string | null; // имя, которое дал владелец в этой группе
  joined_at: string;
}

// Часть запроса к таблице groups: group_members(...)
export const MEMBERS_SELECT =
  'group_members(joined_at, profiles(id, username, first_name, photo_url, custom_name, premium_since), group_member_names(name))';

type NameRow = { name: string };

interface RawMember {
  joined_at: string;
  profiles: Omit<GroupMember, 'joined_at' | 'group_name'> | null;
  group_member_names: NameRow | NameRow[] | null;
}

// Связи без сгенерированных типов — разбираем вручную; участники по времени вступления
export function parseMembers(raw: unknown): GroupMember[] {
  return (raw as RawMember[])
    .flatMap((m) => {
      if (!m.profiles) return [];
      const names = m.group_member_names;
      const groupName = Array.isArray(names) ? (names[0]?.name ?? null) : (names?.name ?? null);
      return [{ ...m.profiles, group_name: groupName, joined_at: m.joined_at }];
    })
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}
