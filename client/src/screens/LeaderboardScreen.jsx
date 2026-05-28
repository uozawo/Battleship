import { useEffect, useState } from 'react';
import { api } from '../api.js';
import HudFrame from '../components/HudFrame.jsx';

export default function LeaderboardScreen({ onBack }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .leaderboard()
      .then((data) => alive && setRows(data))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="scene">
      <div className="text-center enter">
        <div className="eyebrow">// РЕЄСТР ДОБЛЕСТІ</div>
        <h2 className="title" style={{ marginTop: 8 }}>
          ТОП-10 КАПІТАНІВ 🏆
        </h2>
      </div>

      <div className="auth-card enter enter-1" style={{ width: 'min(560px, 100%)' }}>
        <HudFrame>
          {err && <div className="readout readout--err mono">{err}</div>}
          {!err && (
            <table className="roster">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Позивний</th>
                  <th style={{ textAlign: 'right' }}>Перемог</th>
                  <th style={{ textAlign: 'right' }}>Поразок</th>
                </tr>
              </thead>
              <tbody>
                {rows === null && (
                  <tr>
                    <td colSpan="4" className="muted">
                      Завантаження…
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan="4" className="muted">
                      Поки що немає жодного завершеного бою.
                    </td>
                  </tr>
                )}
                {rows &&
                  rows.map((p, i) => (
                    <tr key={p.username}>
                      <td className={`rank ${i < 3 ? `rank--${i + 1}` : ''}`}>
                        {i === 0 ? '★' : i + 1}
                      </td>
                      <td className="name">{p.username}</td>
                      <td className="w" style={{ textAlign: 'right' }}>
                        {p.wins}
                      </td>
                      <td className="l" style={{ textAlign: 'right' }}>
                        {p.losses}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </HudFrame>
      </div>

      <button className="btn-link enter enter-2" onClick={onBack}>
        ◂ назад у командний центр
      </button>
    </div>
  );
}
