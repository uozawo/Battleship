import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import authRouter from './auth.js';
import { topPlayers } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Будує Express-застосунок (без прослуховування порту). */
export function createApp() {
  const app = express();
  app.use(express.json());

  // REST API
  app.use('/api/auth', authRouter);
  app.get('/api/leaderboard', (req, res) => res.json(topPlayers(10)));
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Невідомий /api → JSON 404 (а не HTML).
  app.use('/api', (req, res) => res.status(404).json({ error: 'Не знайдено' }));

  // Продакшн: роздаємо зібраний клієнт (у dev цим займається Vite).
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  return app;
}
