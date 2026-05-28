import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import HudFrame from '../components/HudFrame.jsx';

export default function AuthScreen() {
  const { login, register, guest } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null); // { type: 'err'|'ok', text }
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Помилка' });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(() => (mode === 'login' ? login(username, password) : register(username, password)));
  };

  return (
    <div className="scene">
      <div className="text-center enter">
        <div className="eyebrow">// NAVAL COMMAND · ТАКТИЧНИЙ СИМУЛЯТОР</div>
        <h1 className="title title--hero" style={{ marginTop: 10 }}>
          МОРСЬКИЙ <span className="accent">БІЙ</span>
        </h1>
      </div>

      <div className="auth-card enter enter-1">
        <HudFrame>
          <div className="auth-toggle">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Вхід
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Реєстрація
            </button>
          </div>

          <form className="stack" onSubmit={submit}>
            <div className="field-group">
              <label className="field-label">Позивний</label>
              <input
                className="field"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="capt_nemo"
                autoComplete="username"
                required
              />
            </div>
            <div className="field-group">
              <label className="field-label">Код доступу</label>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
            <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
              {busy ? 'зачекайте…' : mode === 'login' ? 'увійти в систему' : 'створити пілота'}
            </button>
          </form>

          {msg && (
            <div className={`readout readout--${msg.type === 'err' ? 'err' : 'ok'} mono`} style={{ marginTop: 16 }}>
              {msg.text}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 18, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.2em' }}>
            — АБО —
          </div>
          <button
            className="btn btn--ghost btn--block"
            style={{ marginTop: 12 }}
            onClick={() => run(guest)}
            disabled={busy}
          >
            ▸ швидкий вхід як гість
          </button>
          <p className="muted mono" style={{ fontSize: '0.72rem', textAlign: 'center', marginTop: 10 }}>
            Гість зручний для тесту у 2 вкладках. Не впливає на рейтинг.
          </p>
        </HudFrame>
      </div>
    </div>
  );
}
