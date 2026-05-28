import GameView from '../components/GameView.jsx';
import { useBotGame } from '../hooks/useBotGame.js';

export default function BotGame({ onExit }) {
  const game = useBotGame();
  const exit = () => {
    game.leave();
    onExit();
  };
  return <GameView game={game} onExit={exit} onAgain={game.again} />;
}
