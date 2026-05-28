import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, getUserByName, getUserById } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] УВАГА: JWT_SECRET не задано — використовую небезпечний dev-секрет.');
}

const TOKEN_TTL = '7d';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET); // кидає виняток, якщо токен недійсний
}

/** Express-middleware: вимагає валідний Bearer-токен, кладе дані у req.user. */
export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Потрібна авторизація' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Недійсний або прострочений токен' });
  }
}

const router = Router();

// Реєстрація
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Вкажіть імʼя та пароль' });
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Імʼя має бути 3–20 символів' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'Пароль мінімум 4 символи' });
  if (getUserByName(username)) return res.status(409).json({ error: 'Користувач уже існує' });

  try {
    const hash = await bcrypt.hash(password, 10);
    createUser(username, hash);
    res.status(201).json({ success: true });
  } catch {
    res.status(409).json({ error: 'Користувач уже існує' });
  }
});

// Вхід
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Вкажіть імʼя та пароль' });

  const user = getUserByName(username);
  if (!user) return res.status(401).json({ error: 'Невірне імʼя або пароль' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Невірне імʼя або пароль' });

  const token = signToken({ id: user.id, username: user.username, guest: false });
  res.json({
    token,
    user: { username: user.username, wins: user.wins, losses: user.losses, guest: false },
  });
});

// Гостьовий вхід (ефемерний, не в БД, не в лідерборді) — для тесту в 2 вкладки
router.post('/guest', (req, res) => {
  const name = 'Гість-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const token = signToken({ id: null, username: name, guest: true });
  res.json({ token, user: { username: name, wins: 0, losses: 0, guest: true } });
});

// Поточний профіль (актуальна статистика)
router.get('/me', authRequired, (req, res) => {
  if (req.user.guest) {
    return res.json({ user: { username: req.user.username, wins: 0, losses: 0, guest: true } });
  }
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
  res.json({ user: { ...user, guest: false } });
});

export default router;
