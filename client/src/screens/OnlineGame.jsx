import GameView from '../components/GameView.jsx';
import { useOnlineGame } from '../hooks/useOnlineGame.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function OnlineGame({ action, code, onExit }) {
  const { token, refreshUser } = useAuth();
  const game = useOnlineGame({ token, action, code, onFinished: refreshUser });
  const exit = () => {
    game.leave();
    onExit();
  };
  return <GameView game={game} onExit={exit} onAgain={null} />;
}
