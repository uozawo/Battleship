import { useEffect, useState } from 'react';

const TOTAL_MS = 30_000;

// Кільце-таймер. Відлік ведеться від серверного дедлайну (ms timestamp).
export default function TurnTimer({ deadline }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!deadline) return null;
  const remain = Math.max(0, deadline - now);
  const secs = Math.ceil(remain / 1000);
  const pct = Math.max(0, Math.min(100, (remain / TOTAL_MS) * 100));
  const urgent = secs <= 10;

  return (
    <div className={`timer ${urgent ? 'timer--urgent' : ''}`} style={{ '--pct': pct }}>
      <span className="timer__num">{secs}</span>
    </div>
  );
}
