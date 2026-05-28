import HudFrame from './HudFrame.jsx';

const REASONS = {
  'fleet-destroyed': 'Ворожий флот знищено',
  'opponent-left': 'Суперник залишив бій',
  'all-sunk': 'Ваш флот знищено',
};

// Модалка завершення бою.
export default function ResultModal({ result, reason, onMenu, onAgain }) {
  if (!result) return null;
  const win = result === 'win';

  return (
    <div className="modal-backdrop">
      <HudFrame className="modal enter">
        <div className="eyebrow">{win ? '// БОЙОВЕ ДОНЕСЕННЯ' : '// БОЙОВЕ ДОНЕСЕННЯ'}</div>
        <div className={`verdict ${win ? 'verdict--win' : 'verdict--loss'}`}>
          {win ? 'ПЕРЕМОГА' : 'ПОРАЗКА'}
        </div>
        <p className="muted mono" style={{ marginBottom: 24 }}>
          {REASONS[reason] || (win ? 'Операцію виконано' : 'Операцію провалено')}
        </p>
        <div className="stack">
          {onAgain && (
            <button className="btn btn--primary btn--block" onClick={onAgain}>
              ще раз
            </button>
          )}
          <button className="btn btn--ghost btn--block" onClick={onMenu}>
            до командного центру
          </button>
        </div>
      </HudFrame>
    </div>
  );
}
