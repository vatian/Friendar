import { useMemo, useState } from 'react';
import { useProfile } from '../auth/AuthProvider';
import { errorText } from '../errors';
import { displayName } from '../telegram/telegram';
import { useBackButton } from '../telegram/useBackButton';
import { Avatar } from '../ui/Avatar';
import { allTimezones, deviceTimezone, updateTimezone, utcOffsetLabel } from './api';

export function ProfilePage() {
  useBackButton('/');
  const [profile, setProfile] = useProfile();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezones = useMemo(allTimezones, []);
  const device = deviceTimezone();
  const me = displayName(profile);

  async function save(timezone: string) {
    if (timezone === profile.timezone) return;
    setSaving(true);
    setError(null);
    try {
      await updateTimezone(profile.id, timezone);
      setProfile({ ...profile, timezone });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="card row">
        <Avatar name={me} photoUrl={profile.photo_url} />
        <div className="grow">
          <div>{me}</div>
          <div className="hint">Имя и ник берутся из Telegram</div>
        </div>
      </div>

      <div className="card stack">
        <label htmlFor="timezone">Основной часовой пояс</label>
        <p className="hint">
          В нём создаются ваши отметки в календаре и показывается всё время в приложении. Если
          поменять пояс, уже созданные отметки пересчитаются в новый.
        </p>
        <select
          id="timezone"
          className="input"
          value={profile.timezone}
          disabled={saving}
          onChange={(e) => save(e.target.value)}
        >
          {timezones.map((tz) => (
            <option key={tz.id} value={tz.id}>
              {tz.label}
            </option>
          ))}
        </select>
        {device !== profile.timezone && (
          <button className="button secondary" disabled={saving} onClick={() => save(device)}>
            Как на телефоне: {device.replace(/_/g, ' ')} ({utcOffsetLabel(device)})
          </button>
        )}
        {saving && <p className="hint">Сохраняем…</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
