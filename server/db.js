import './silence.js'; // ПЕРШИМ: глушить ExperimentalWarning до завантаження node:sqlite
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB_PATH=:memory: використовується в тестах; інакше — файл game.db поряд із сервером.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'game.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    wins          INTEGER NOT NULL DEFAULT 0,
    losses        INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Створити користувача. Кидає виняток, якщо імʼя зайняте (UNIQUE). */
export function createUser(username, passwordHash) {
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);
  return { id: Number(info.lastInsertRowid), username, wins: 0, losses: 0 };
}

export function getUserByName(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(id) {
  return db.prepare('SELECT id, username, wins, losses FROM users WHERE id = ?').get(id);
}

/** +1 до wins або losses. `won` — boolean. Колонка контрольована (не з вводу). */
export function recordResult(userId, won) {
  const column = won ? 'wins' : 'losses';
  db.prepare(`UPDATE users SET ${column} = ${column} + 1 WHERE id = ?`).run(userId);
}

/** Топ-N гравців за перемогами (гостей у БД немає за визначенням). */
export function topPlayers(limit = 10) {
  return db
    .prepare('SELECT username, wins, losses FROM users ORDER BY wins DESC, losses ASC, username ASC LIMIT ?')
    .all(limit);
}

export default db;
