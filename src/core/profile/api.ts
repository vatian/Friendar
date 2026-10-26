import { supabase } from '../supabase/client';

export async function updateTimezone(userId: string, timezone: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ timezone, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// Пояс телефона, например Europe/Moscow
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Русские названия частых поясов; для остальных — город из названия пояса
const RUSSIAN_NAMES: Record<string, string> = {
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Moscow': 'Москва',
  'Europe/Simferopol': 'Симферополь',
  'Europe/Kirov': 'Киров',
  'Europe/Volgograd': 'Волгоград',
  'Europe/Astrakhan': 'Астрахань',
  'Europe/Saratov': 'Саратов',
  'Europe/Ulyanovsk': 'Ульяновск',
  'Europe/Samara': 'Самара',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск',
  'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Barnaul': 'Барнаул',
  'Asia/Tomsk': 'Томск',
  'Asia/Novokuznetsk': 'Новокузнецк',
  'Asia/Krasnoyarsk': 'Красноярск',
  'Asia/Irkutsk': 'Иркутск',
  'Asia/Chita': 'Чита',
  'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Magadan': 'Магадан',
  'Asia/Sakhalin': 'Сахалин',
  'Asia/Srednekolymsk': 'Среднеколымск',
  'Asia/Kamchatka': 'Камчатка',
  'Asia/Anadyr': 'Анадырь',
  'Europe/Minsk': 'Минск',
  'Europe/Kyiv': 'Киев',
  'Europe/Kiev': 'Киев',
  'Europe/Chisinau': 'Кишинёв',
  'Europe/Riga': 'Рига',
  'Europe/Vilnius': 'Вильнюс',
  'Europe/Tallinn': 'Таллин',
  'Asia/Tbilisi': 'Тбилиси',
  'Asia/Yerevan': 'Ереван',
  'Asia/Baku': 'Баку',
  'Asia/Almaty': 'Алматы',
  'Asia/Tashkent': 'Ташкент',
  'Asia/Bishkek': 'Бишкек',
  'Asia/Dushanbe': 'Душанбе',
  'Europe/Istanbul': 'Стамбул',
  'Europe/Belgrade': 'Белград',
  'Europe/Berlin': 'Берлин',
  'Europe/Paris': 'Париж',
  'Europe/London': 'Лондон',
  'Asia/Dubai': 'Дубай',
  'Asia/Bangkok': 'Бангкок',
  'America/New_York': 'Нью-Йорк',
};

export function timezoneName(timezone: string): string {
  return RUSSIAN_NAMES[timezone] ?? timezone.split('/').pop()!.replace(/_/g, ' ');
}

// «GMT+3» для пояса в текущий момент
export function utcOffsetLabel(timezone: string): string {
  const part = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? '';
}

// Все пояса, отсортированные по смещению от UTC
export function allTimezones(): { id: string; label: string }[] {
  const now = new Date();
  const offsetMinutes = (tz: string) => {
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    return (local.getTime() - utc.getTime()) / 60000;
  };
  return Intl.supportedValuesOf('timeZone')
    .map((id) => ({ id, offset: offsetMinutes(id) }))
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
    .map(({ id }) => ({
      id,
      label: `${utcOffsetLabel(id)} · ${RUSSIAN_NAMES[id] ?? id.replace(/_/g, ' ')}`,
    }));
}
