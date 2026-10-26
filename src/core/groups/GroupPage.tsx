import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { features } from '../../features/registry';
import { useProfile } from '../auth/AuthProvider';
import { errorText } from '../errors';
import { useBackButton } from '../telegram/useBackButton';
import {
  alertDialog,
  confirmDialog,
  displayName,
  inviteLink,
  shareLink,
} from '../telegram/telegram';
import { Avatar } from '../ui/Avatar';
import { useAsync } from '../ui/useAsync';
import {
  fetchGroup,
  getInviteCode,
  leaveGroup,
  MAX_MEMBERS_PER_GROUP,
  regenerateInviteCode,
  removeMember,
  renameGroup,
  type GroupDetails,
} from './api';

export function GroupPage() {
  const { groupId = '' } = useParams();
  useBackButton('/');
  const [group, reload] = useAsync(() => fetchGroup(groupId), [groupId]);

  if (group.status === 'loading') return <p className="hint">Загружаем…</p>;
  if (group.status === 'error') return <p className="error">{errorText(group.error)}</p>;
  if (!group.data) {
    return (
      <div className="card stack">
        <p>Группа не найдена или вы в ней больше не состоите.</p>
        <Link to="/" className="link">
          К моим группам
        </Link>
      </div>
    );
  }

  return <GroupView group={group.data} reload={reload} />;
}

function GroupView({ group, reload }: { group: GroupDetails; reload: () => void }) {
  const [profile] = useProfile();
  const navigate = useNavigate();
  const isOwner = group.owner_id === profile.id;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      reload();
    } catch (err) {
      await alertDialog(errorText(err));
    }
  }

  async function onLeave() {
    const others = group.members.length - 1;
    const warning = !isOwner
      ? 'Выйти из группы?'
      : others === 0
        ? 'Вы последний участник. Группа и все её данные будут удалены. Выйти?'
        : 'Вы владелец. Права перейдут участнику, который дольше всех в группе. Выйти?';
    if (!(await confirmDialog(warning))) return;
    try {
      await leaveGroup(group.id);
      navigate('/');
    } catch (err) {
      await alertDialog(errorText(err));
    }
  }

  async function onRemove(memberId: string, name: string) {
    if (!(await confirmDialog(`Удалить ${name} из группы?`))) return;
    await run(() => removeMember(group.id, memberId));
  }

  return (
    <div className="stack">
      {isOwner ? (
        <GroupNameEditor group={group} onSaved={reload} />
      ) : (
        <h1 className="page-title">{group.name}</h1>
      )}

      {features.length > 0 && (
        <div className="list">
          {features.map((f) => (
            <Link key={f.id} to={`/group/${group.id}/${f.id}`} className="list-item">
              <span className="feature-icon">{f.icon}</span>
              <div className="grow">{f.title}</div>
              <span className="chevron">›</span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="section-title">
        Участники · {group.members.length} из {MAX_MEMBERS_PER_GROUP}
      </h2>
      <div className="list">
        {group.members.map((m) => {
          const name = displayName(m);
          return (
            <div key={m.id} className="list-item">
              <Avatar name={name} photoUrl={m.photo_url} />
              <div className="grow">
                <div>
                  {name}
                  {m.id === profile.id && <span className="hint"> · вы</span>}
                </div>
                {m.id === group.owner_id && <div className="hint">владелец</div>}
              </div>
              {isOwner && m.id !== profile.id && (
                <button className="text-button danger" onClick={() => onRemove(m.id, name)}>
                  Удалить
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isOwner && group.members.length < MAX_MEMBERS_PER_GROUP && (
        <InviteSection groupId={group.id} groupName={group.name} />
      )}
      {isOwner && group.members.length >= MAX_MEMBERS_PER_GROUP && (
        <p className="hint">В группе максимум участников — новых пригласить нельзя.</p>
      )}

      <button className="button secondary danger" onClick={onLeave}>
        Выйти из группы
      </button>
    </div>
  );
}

function GroupNameEditor({ group, onSaved }: { group: GroupDetails; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await renameGroup(group.id, name.trim());
      setEditing(false);
      onSaved();
    } catch (err) {
      await alertDialog(errorText(err));
    }
  }

  if (!editing) {
    return (
      <div className="row">
        <h1 className="page-title grow">{group.name}</h1>
        <button className="text-button" onClick={() => setEditing(true)}>
          Переименовать
        </button>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <input
        className="input"
        maxLength={64}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="row">
        <button className="button" disabled={!name.trim()}>
          Сохранить
        </button>
        <button type="button" className="button secondary" onClick={() => setEditing(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}

// Приглашение видит только владелец: код загружается отдельно и только для него.
function InviteSection({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [code, reloadCode] = useAsync(() => getInviteCode(groupId), [groupId]);
  const [copied, setCopied] = useState(false);
  const [override, setOverride] = useState<string | null>(null);

  const current = override ?? (code.status === 'ready' ? code.data : null);
  const link = current ? inviteLink(current) : null;

  async function onCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await alertDialog(link);
    }
  }

  async function onRegenerate() {
    const ok = await confirmDialog(
      'Создать новую ссылку? Старая перестанет работать — по ней больше никто не вступит.',
    );
    if (!ok) return;
    try {
      setOverride(await regenerateInviteCode(groupId));
    } catch (err) {
      await alertDialog(errorText(err));
      reloadCode();
    }
  }

  return (
    <div className="card stack">
      <div>Пригласить друзей</div>
      {code.status === 'error' && <p className="error">{errorText(code.error)}</p>}
      {link && (
        <>
          <div className="invite-link">{link}</div>
          <button
            className="button"
            onClick={() => shareLink(link, `Вступай в группу «${groupName}» в Friendar`)}
          >
            Отправить в Telegram
          </button>
          <div className="row">
            <button className="button secondary" onClick={onCopy}>
              {copied ? 'Скопировано ✓' : 'Скопировать'}
            </button>
            <button className="button secondary" onClick={onRegenerate}>
              Новая ссылка
            </button>
          </div>
        </>
      )}
    </div>
  );
}
