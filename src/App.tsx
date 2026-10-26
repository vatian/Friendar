import { HashRouter, Route, Routes, useParams } from 'react-router';
import { AuthProvider, useAuth } from './core/auth/AuthProvider';
import { GroupPage } from './core/groups/GroupPage';
import { GroupsPage } from './core/groups/GroupsPage';
import { JoinFromInvite } from './core/groups/JoinFromInvite';
import { ProfilePage } from './core/profile/ProfilePage';
import { isInsideTelegram } from './core/telegram/telegram';
import { useBackButton } from './core/telegram/useBackButton';
import { features } from './features/registry';

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
      <HashRouter>
        <Screens />
      </HashRouter>
    </AuthProvider>
  );
}

function Screens() {
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
    <>
      <JoinFromInvite />
      <Routes>
        <Route path="/" element={<GroupsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/group/:groupId" element={<GroupPage />} />
        <Route path="/group/:groupId/:featureId" element={<FeatureScreen />} />
        <Route path="*" element={<GroupsPage />} />
      </Routes>
    </>
  );
}

// Экран функции внутри группы — какой именно, берём из реестра.
function FeatureScreen() {
  const { groupId = '', featureId } = useParams();
  useBackButton(`/group/${groupId}`);
  const feature = features.find((f) => f.id === featureId);
  if (!feature) return <p className="hint">Такой функции нет.</p>;
  return <feature.GroupScreen groupId={groupId} />;
}
