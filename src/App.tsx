import { AuthProvider, useAuth } from './core/auth/AuthProvider';
import { displayName, isInsideTelegram } from './core/telegram/telegram';

export function App() {
  if (!isInsideTelegram()) {
    return (
      <div className="card">
        <h1>Friendar</h1>
        <p>Это приложение работает только внутри Telegram.</p>
        <p className="hint">Откройте его через бота @friendar_bot.</p>
      </div>
    );
  }

  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}

function Home() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return <p className="hint">Входим…</p>;
  }

  if (auth.status === 'error') {
    return (
      <div className="card">
        <h1>Friendar</h1>
        <p>{auth.message}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Friendar</h1>
      <p>Привет, {displayName(auth.profile)}!</p>
      <p className="hint">Вы вошли. Часовой пояс: {auth.profile.timezone}</p>
      <p className="hint">Скоро здесь появятся группы и общий календарь.</p>
    </div>
  );
}
