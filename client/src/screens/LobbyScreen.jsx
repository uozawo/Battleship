import { useState } from 'react';
import HudFrame from '../components/HudFrame.jsx';

export default function LobbyScreen({ onCreate, onJoin, onBack }) {
  const [code, setCode] = useState('');

  const join = (e) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) onJoin(trimmed);
  };

  return (
    <div className="scene">
      <div className="text-center enter">
        <div className="eyebrow">// МЕРЕЖЕВА ОПЕРАЦІЯ</div>
        <h2 className="title" style={{ marginTop: 8 }}>
          БОЙОВА ЗОНА
        </h2>
        <p className="muted mono" style={{ fontSize: '0.82rem', marginTop: 6 }}>
          Створіть зону або підключіться до існуючої за кодом
        </p>
      </div>

      <div className="lobby-grid enter enter-1">
        <HudFrame>
          <div className="eyebrow">// РОЗГОРНУТИ</div>
          <h3 className="title" style={{ fontSize: '1.25rem', margin: '10px 0' }}>
            Створити зону
          </h3>
          <p className="muted mono" style={{ fontSize: '0.82rem', marginBottom: 20 }}>
            Сервер видасть код. Передайте його супернику — і він приєднається.
          </p>
          <button className="btn btn--primary btn--block" onClick={onCreate}>
            ⚓ створити кімнату
          </button>
        </HudFrame>

        <HudFrame>
          <div className="eyebrow">// ПРИЄДНАТИСЯ</div>
          <h3 className="title" style={{ fontSize: '1.25rem', margin: '10px 0' }}>
            Зайти за кодом
          </h3>
          <form className="stack" onSubmit={join}>
            <input
              className="field"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="напр. K7QF"
              maxLength={4}
              style={{ textTransform: 'uppercase', letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.3rem' }}
              autoComplete="off"
            />
            <button className="btn btn--sea btn--block" type="submit" disabled={!code.trim()}>
              ▸ увійти в бій
            </button>
          </form>
        </HudFrame>
      </div>

      <button className="btn-link enter enter-2" onClick={onBack}>
        ◂ назад у командний центр
      </button>
    </div>
  );
}
