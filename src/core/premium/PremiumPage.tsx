import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { errorText } from '../errors';
import { useBackButton } from '../telegram/useBackButton';
import { isPremium, redeemPromo } from './api';

const BENEFITS = [
  ['👥', 'До 10 групп', 'вместо 2'],
  ['🎉', 'До 15 участников', 'в группах, где вы владелец (вместо 6)'],
  ['✏️', 'Своё имя', 'показывается вместо ника во всех группах'],
  ['🏷️', 'Имена участников', 'в своих группах — видны только в этой группе'],
  ['🎨', 'Цвет кнопок', 'в группах, где вы владелец'],
  ['⭐', 'Звёздочка', 'рядом с вашим именем'],
];

export function PremiumPage() {
  useBackButton('/');
  const [profile, setProfile] = useProfile();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const premium = isPremium(profile);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      if (await redeemPromo(code)) {
        setProfile({ ...profile, premium_since: profile.premium_since ?? new Date().toISOString() });
        setCode('');
      } else {
        setMessage({ error: true, text: 'Такого промокода нет. Проверьте, нет ли опечатки.' });
      }
    } catch (err) {
      setMessage({ error: true, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="page-title">Премиум ⭐</h1>

      {premium ? (
        <div className="card stack">
          <div className="form-title">У вас премиум навсегда 🎉</div>
          <p className="hint">
            Своё имя можно задать в <Link to="/profile" className="link">профиле</Link>, имена участников и
            цвет кнопок — на экране своей группы.
          </p>
        </div>
      ) : (
        <form className="card stack" onSubmit={onSubmit}>
          <label htmlFor="promo">Промокод</label>
          <input
            id="promo"
            className="input"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="Введите промокод"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="button" disabled={busy || !code.trim()}>
            {busy ? 'Проверяем…' : 'Активировать'}
          </button>
          {message && <p className={message.error ? 'error' : 'hint'}>{message.text}</p>}
        </form>
      )}

      <h2 className="section-title">Что даёт премиум</h2>
      <div className="list">
        {BENEFITS.map(([icon, title, hint]) => (
          <div key={title} className="list-item">
            <span className="feature-icon">{icon}</span>
            <div className="grow">
              <div>{title}</div>
              <div className="hint">{hint}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
