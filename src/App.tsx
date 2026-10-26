import { displayName, isInsideTelegram, tg } from './core/telegram/telegram';

export function App() {
  if (!isInsideTelegram()) {
    return (
      <div className="card">
        <h1>Friendar</h1>
        <p>Это приложение работает только внутри Telegram.</p>
        <p className="hint">Откройте его через бота Friendar.</p>
      </div>
    );
  }

  const user = tg?.initDataUnsafe.user;

  return (
    <div className="card">
      <h1>Friendar</h1>
      <p>Привет, {user ? displayName(user) : 'друг'}!</p>
      <p className="hint">Скоро здесь появятся группы и общий календарь.</p>
    </div>
  );
}
