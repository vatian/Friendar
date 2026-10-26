import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { errorText } from '../errors';
import { isPremium, setMyName } from '../premium/api';
import { displayName } from '../telegram/telegram';
import { useBackButton } from '../telegram/useBackButton';
import { Avatar } from '../ui/Avatar';
import { allTimezones, deviceTimezone, timezoneName, updateTimezone, utcOffsetLabel } from './api';

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
          <div className="hint">
            {profile.custom_name ? 'Ваше имя в приложении' : 'Имя и ник берутся из Telegram'}
          </div>
        </div>
      </div>

      <CustomNameCard />

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
            Как на телефоне: {timezoneName(device)} ({utcOffsetLabel(device)})
          </button>
        )}
        {saving && <p className="hint">Сохраняем…</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

// Своё имя вместо ника — премиум
function CustomNameCard() {
  const [profile, setProfile] = useProfile();
  const [name, setName] = useState(profile.custom_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPremium(profile)) {
    return (
      <Link to="/premium" className="card row">
        <span className="feature-icon">✏️</span>
        <div className="grow hint">Своё имя вместо ника — с премиумом ⭐</div>
        <span className="chevron">›</span>
      </Link>
    );
  }

  async function save(value: string | null) {
    setBusy(true);
    setError(null);
    try {
      await setMyName(value);
      setProfile({ ...profile, custom_name: value });
      if (value === null) setName('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save(name.trim());
      }}
    >
      <label htmlFor="custom-name">Имя в приложении</label>
      <p className="hint">Его увидят во всех группах вместо ника. Владелец группы может дать вам своё имя в своей группе.</p>
      <input
        id="custom-name"
        className="input"
        maxLength={32}
        placeholder={profile.username ? `@${profile.username}` : profile.first_name}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="button" disabled={busy || !name.trim() || name.trim() === profile.custom_name}>
        Сохранить
      </button>
      {profile.custom_name && (
        <button type="button" className="button secondary" disabled={busy} onClick={() => save(null)}>
          Сбросить — показывать ник
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
