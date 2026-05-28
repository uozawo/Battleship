import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { setupSockets } from './socket.js';

/** Створює HTTP-сервер + Socket.io, не запускаючи прослуховування (зручно для тестів). */
export function createServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true } });
  const rooms = setupSockets(io);
  return { app, server, io, rooms };
}

const PORT = process.env.PORT || 3000;
const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');

if (isMain) {
  const { server } = createServer();
  server.listen(PORT, () => {
    console.log(`⚓  Battleship-сервер запущено: http://localhost:${PORT}`);
  });
}
