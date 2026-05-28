import Board from './Board.jsx';
import TurnTimer from './TurnTimer.jsx';
import ResultModal from './ResultModal.jsx';
import HudFrame from './HudFrame.jsx';

// Доріжка флоту: 10 кораблів, кожен зі своїми «палубами».
function FleetTrack({ sizes, index }) {
  return (
    <div className="fleet-track">
      {sizes.map((size, i) => (
        <div
          key={i}
          className={`fleet-pip ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}`}
          title={`${size}-палубний`}
        >
          {Array.from({ length: size }, (_, k) => (
            <i key={k} />
          ))}
        </div>
      ))}
    </div>
  );
}

function copyCode(code) {
  try {
    navigator.clipboard?.writeText(code);
  } catch {
    /* ignore */
  }
}

/**
 * Спільний вигляд бойового екрана для бота й онлайну.
 * @param game   уніфікований обʼєкт стану (useBotGame | useOnlineGame)
 * @param onExit вихід у командний центр
 * @param onAgain (необовʼязково) почати знову — лише бот
 */
export default function GameView({ game, onExit, onAgain }) {
  const {
    mode,
    phase,
    status,
    error,
    roomCode,
    opponent,
    playerBoard,
    enemyBoard,
    placement,
    isReady,
    enemyReady,
    isMyTurn,
    turnDeadline,
    result,
    reason,
  } = game;

  const sizes = placement.sizes;
  const allPlaced = placement.index >= sizes.length;
  const placing = phase === 'placement' && !allPlaced && !isReady;
  const currentSize = placing ? sizes[placement.index] : null;
  const showEnemy = phase === 'battle' || phase === 'over';

  const title =
    phase === 'battle'
      ? 'БОЙОВА ОПЕРАЦІЯ'
      : phase === 'over'
        ? 'ОПЕРАЦІЮ ЗАВЕРШЕНО'
        : phase === 'connecting'
          ? 'ЗʼЄДНАННЯ'
          : phase === 'waiting'
            ? 'ОЧІКУВАННЯ СУПЕРНИКА'
            : 'РОЗГОРТАННЯ ФЛОТУ';

  return (
    <div className="scene scene--game">
      {/* Заголовок операції */}
      <div className="text-center enter">
        <div className="eyebrow">
          {mode === 'bot' ? '// ЛОКАЛЬНА СИМУЛЯЦІЯ' : '// МЕРЕЖЕВА ОПЕРАЦІЯ'}
          {opponent ? ` · ПРОТИВНИК: ${opponent}` : ''}
        </div>
        <h2 className="title" style={{ marginTop: 6 }}>
          {title}
        </h2>
      </div>

      {/* Статус + таймер */}
      <div className="statusbar enter enter-1">
        <span className="status-text">{status}</span>
        {phase === 'battle' && isMyTurn && turnDeadline && <TurnTimer deadline={turnDeadline} />}
      </div>

      {error && <div className="readout readout--err mono">{error}</div>}

      {/* Очікування суперника (онлайн create) */}
      {phase === 'waiting' && roomCode && (
        <HudFrame className="enter enter-2" style={{ width: 'min(440px, 100%)' }}>
          <div className="eyebrow">// КОД БОЙОВОЇ ЗОНИ</div>
          <div className="code-display" style={{ marginTop: 12 }}>
            <span>{roomCode}</span>
            <button className="btn btn--ghost btn--sm" onClick={() => copyCode(roomCode)}>
              копі
            </button>
          </div>
          <p className="muted mono" style={{ fontSize: '0.82rem', marginTop: 4 }}>
            Передайте код супернику. Бій почнеться, щойно він приєднається.
          </p>
        </HudFrame>
      )}

      {phase === 'connecting' && (
        <p className="muted mono enter enter-2">Установлення захищеного каналу…</p>
      )}

      {/* Поле бою */}
      {(phase === 'placement' || showEnemy) && (
        <div className="battlefield enter enter-2">
          <div className="board-col">
            <div className="board-heading">
              <span className="pip pip--you" /> ВАШ ФЛОТ
            </div>
            <Board
              board={playerBoard}
              variant="own"
              interactive={placing}
              placement={placing ? { size: currentSize, dir: placement.direction } : null}
              onCellClick={game.placeCell}
            />
          </div>

          {showEnemy && (
            <div className="board-col">
              <div className="board-heading">
                <span className="pip pip--enemy" /> РАДАР СУПРОТИВНИКА
              </div>
              <Board
                board={enemyBoard}
                variant="enemy"
                radar
                interactive={phase === 'battle' && isMyTurn}
                onCellClick={game.fireCell}
              />
            </div>
          )}
        </div>
      )}

      {/* Панель розстановки / готовності */}
      {phase === 'placement' && (
        <HudFrame className="placement enter enter-3">
          {!isReady && (
            <>
              <div className="eyebrow text-center">
                {allPlaced
                  ? '// ФЛОТ РОЗГОРНУТО'
                  : `// КОРАБЕЛЬ ${placement.index + 1} З ${sizes.length} · ${currentSize}-ПАЛУБНИЙ`}
              </div>
              <FleetTrack sizes={sizes} index={placement.index} />

              {!allPlaced && (
                <div className="placement-actions" style={{ marginBottom: 12 }}>
                  <button
                    className={`btn btn--sm ${placement.direction === 'H' ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={() => game.setDirection('H')}
                  >
                    ─ горизонт.
                  </button>
                  <button
                    className={`btn btn--sm ${placement.direction === 'V' ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={() => game.setDirection('V')}
                  >
                    │ вертик.
                  </button>
                </div>
              )}

              <div className="placement-actions">
                <button className="btn btn--ghost btn--sm" onClick={game.autoPlace}>
                  ⚄ випадково
                </button>
                <button className="btn btn--ghost btn--sm" onClick={game.resetPlacement}>
                  ↺ скинути
                </button>
                {allPlaced && (
                  <button className="btn btn--sea" onClick={game.ready}>
                    ⚑ до бою
                  </button>
                )}
              </div>
            </>
          )}

          {isReady && (
            <div className="text-center">
              <div className="eyebrow">// ОЧІКУВАННЯ</div>
              <p className="mono" style={{ margin: '10px 0' }}>
                Ваш флот прийнято командуванням.
              </p>
              <div className="ready-row">
                <span className="ready-chip on">ВИ: ГОТОВІ</span>
                <span className={`ready-chip ${enemyReady ? 'on' : ''}`}>
                  СУПЕРНИК: {enemyReady ? 'ГОТОВИЙ' : 'ОЧІКУЄ'}
                </span>
              </div>
            </div>
          )}
        </HudFrame>
      )}

      {/* Нижні дії */}
      <div className="enter enter-4" style={{ marginTop: 8 }}>
        <button className="btn btn--danger btn--sm" onClick={onExit}>
          ✕ {phase === 'battle' ? 'капітулювати' : 'вийти'}
        </button>
      </div>

      <ResultModal result={result} reason={reason} onMenu={onExit} onAgain={onAgain} />
    </div>
  );
}
