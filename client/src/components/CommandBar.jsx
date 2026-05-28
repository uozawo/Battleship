// Верхня командна шапка для авторизованих екранів.
export default function CommandBar({ user, onLogout }) {
  return (
    <header className="commandbar enter">
      <div className="commandbar__brand">
        <span className="dot" />
        МОРСЬКИЙ БІЙ
      </div>
      <div className="commandbar__user">
        <span>
          ПОЗИВНИЙ: <span className="commandbar__callsign">{user?.username}</span>
          {user?.guest ? ' (гість)' : ''}
        </span>
        <button className="btn-link" onClick={onLogout}>
          ВИЙТИ ▸
        </button>
      </div>
    </header>
  );
}
