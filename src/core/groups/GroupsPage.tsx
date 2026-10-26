import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { errorText } from '../errors';
import { timezoneName, utcOffsetLabel } from '../profile/api';
import { displayName } from '../telegram/telegram';
import { Avatar } from '../ui/Avatar';
import { useAsync } from '../ui/useAsync';
import { createGroup, fetchMyGroups, MAX_GROUPS_PER_USER, MAX_MEMBERS_PER_GROUP } from './api';

// Главный экран: мои группы и создание новой.
export function GroupsPage() {
  const [profile] = useProfile();
  const navigate = useNavigate();
  const [groups] = useAsync(fetchMyGroups, []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = displayName(profile);
  const canCreate = groups.status === 'ready' && groups.data.length < MAX_GROUPS_PER_USER;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createGroup(name.trim());
      navigate(`/group/${id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Link to="/profile" className="card row">
        <Avatar name={me} photoUrl={profile.photo_url} />
        <div className="grow">
          <div>{me}</div>
          <div className="hint">
            Часовой пояс: {timezoneName(profile.timezone)} ({utcOffsetLabel(profile.timezone)})
          </div>
        </div>
        <span className="chevron">›</span>
      </Link>

      <h2 className="section-title">Мои группы</h2>

      {groups.status === 'loading' && <p className="hint">Загружаем…</p>}
      {groups.status === 'error' && <p className="error">{errorText(groups.error)}</p>}
      {groups.status === 'ready' && groups.data.length === 0 && (
        <p className="hint">
          Вы пока не состоите ни в одной группе. Создайте свою или попросите друга прислать
          ссылку-приглашение.
        </p>
      )}
      {groups.status === 'ready' && groups.data.length > 0 && (
        <div className="list">
          {groups.data.map((g) => (
            <Link key={g.id} to={`/group/${g.id}`} className="list-item">
              <div className="grow">
                <div>{g.name}</div>
                <div className="hint">
                  {g.member_count} из {MAX_MEMBERS_PER_GROUP} участников
                  {g.owner_id === profile.id && ' · вы владелец'}
                </div>
              </div>
              <span className="chevron">›</span>
            </Link>
          ))}
        </div>
      )}

      {canCreate && (
        <form className="card stack" onSubmit={onCreate}>
          <label htmlFor="group-name">Новая группа</label>
          <input
            id="group-name"
            className="input"
            placeholder="Например, «Друзья с универа»"
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="button" disabled={busy || !name.trim()}>
            {busy ? 'Создаём…' : 'Создать группу'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
      {groups.status === 'ready' && !canCreate && (
        <p className="hint">
          Можно состоять максимум в {MAX_GROUPS_PER_USER} группах. Чтобы создать новую, выйдите из
          одной.
        </p>
      )}
    </div>
  );
}
