import { verifyToken } from './auth.js';
import { createRoomManager } from './rooms.js';

/** Підключає JWT-автентифікацію сокетів і маршрутизацію подій кімнат. */
export function setupSockets(io) {
  // Кожне зʼєднання має нести валідний JWT у handshake.auth.token.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Потрібна авторизація'));
    try {
      const user = verifyToken(token);
      socket.data.user = { id: user.id ?? null, username: user.username, guest: !!user.guest };
      next();
    } catch {
      next(new Error('Недійсний токен'));
    }
  });

  const manager = createRoomManager(io);
  io.on('connection', (socket) => manager.handleConnection(socket));
  return manager;
}
