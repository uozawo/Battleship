import { useAuth } from '../context/AuthContext.jsx';
import HudFrame from '../components/HudFrame.jsx';

export default function MenuScreen({ onStartBot, onOpenLobby, onOpenLeaderboard }) {
  const { user } = useAuth();

  return (
    <div className="scene">
      <div className="text-center enter">
        <div className="eyebrow">// КОМАНДНИЙ ЦЕНТР</div>
        <h1 className="title title--hero" style={{ marginTop: 8 }}>
          МОРСЬКИЙ <span className="accent">БІЙ</span>
        </h1>
      </div>

      <div className="auth-card enter enter-1" style={{ width: 'min(480px, 100%)' }}>
        <HudFrame>
          <div className="menu-grid">
            <button
              className="mode-btn"
              style={{ '--btn-accent': 'var(--blood)' }}
              onClick={onOpenLobby}
            >
              <span className="mode-btn__glyph">⚔</span>
              <span className="mode-btn__body">
                <span className="mode-btn__title">Мережевий бій</span>
                <span className="mode-btn__desc">Створіть кімнату або зайдіть за кодом · рейтинг</span>
              </span>
              <span className="mode-btn__arrow">▸</span>
            </button>

            <button
              className="mode-btn"
              style={{ '--btn-accent': 'var(--sonar)' }}
              onClick={onStartBot}
            >
              <span className="mode-btn__glyph">🛰</span>
              <span className="mode-btn__body">
                <span className="mode-btn__title">Проти ШІ «Посейдон»</span>
                <span className="mode-btn__desc">Тренування офлайн · не впливає на рейтинг</span>
              </span>
              <span className="mode-btn__arrow">▸</span>
            </button>

            <button
              className="mode-btn"
              style={{ '--btn-accent': 'var(--amber)' }}
              onClick={onOpenLeaderboard}
            >
              <span className="mode-btn__glyph">🏆</span>
              <span className="mode-btn__body">
                <span className="mode-btn__title">Таблиця лідерів</span>
                <span className="mode-btn__desc">Топ-10 капітанів за перемогами</span>
              </span>
              <span className="mode-btn__arrow">▸</span>
            </button>
          </div>

          <div className="stat-strip">
            <div className="stat">
              <div className="stat__num stat__num--win">{user?.wins ?? 0}</div>
              <div className="stat__label">Перемог</div>
            </div>
            <div className="stat">
              <div className="stat__num stat__num--loss">{user?.losses ?? 0}</div>
              <div className="stat__label">Поразок</div>
            </div>
            <div className="stat">
              <div className="stat__num">
                {(() => {
                  const w = user?.wins ?? 0;
                  const l = user?.losses ?? 0;
                  return w + l === 0 ? '—' : `${Math.round((w / (w + l)) * 100)}%`;
                })()}
              </div>
              <div className="stat__label">Влучність</div>
            </div>
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
