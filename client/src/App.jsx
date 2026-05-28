import { useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import CommandBar from './components/CommandBar.jsx';
import AuthScreen from './screens/AuthScreen.jsx';
import MenuScreen from './screens/MenuScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import LeaderboardScreen from './screens/LeaderboardScreen.jsx';
import BotGame from './screens/BotGame.jsx';
import OnlineGame from './screens/OnlineGame.jsx';

export default function App() {
  const { user, booting, logout } = useAuth();
  const [view, setView] = useState({ screen: 'menu' });

  if (booting) {
    return (
      <div className="app-shell">
        <div className="scene">
          <p className="muted mono">// ІНІЦІАЛІЗАЦІЯ СИСТЕМ…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <AuthScreen />
      </div>
    );
  }

  const toMenu = () => setView({ screen: 'menu' });

  let content;
  switch (view.screen) {
    case 'lobby':
      content = (
        <LobbyScreen
          onCreate={() => setView({ screen: 'online', action: 'create' })}
          onJoin={(code) => setView({ screen: 'online', action: 'join', code })}
          onBack={toMenu}
        />
      );
      break;
    case 'leaderboard':
      content = <LeaderboardScreen onBack={toMenu} />;
      break;
    case 'bot':
      content = <BotGame key="bot" onExit={toMenu} />;
      break;
    case 'online':
      content = (
        <OnlineGame
          key={`${view.action}-${view.code || ''}`}
          action={view.action}
          code={view.code}
          onExit={toMenu}
        />
      );
      break;
    default:
      content = (
        <MenuScreen
          onStartBot={() => setView({ screen: 'bot' })}
          onOpenLobby={() => setView({ screen: 'lobby' })}
          onOpenLeaderboard={() => setView({ screen: 'leaderboard' })}
        />
      );
  }

  const showBar = ['menu', 'lobby', 'leaderboard'].includes(view.screen);

  return (
    <div className="app-shell">
      {showBar && (
        <div className="app-shell__bar">
          <CommandBar user={user} onLogout={logout} />
        </div>
      )}
      {content}
    </div>
  );
}
