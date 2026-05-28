import { verifyToken } from './auth.js';
import { getUserById } from './db.js';
import { createRoomManager } from './rooms.js';

/** Підключає JWT-автентифікацію сокетів і маршрутизацію подій кімнат. */
export function setupSockets(io) {
  // Кожне зʼєднання має нести валідний JWT у handshake.auth.token.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Потрібна авторизація'));
    try {
      const user = verifyToken(token);
      // Валідація структури payload + семантичних інваріантів (не лише підпису):
      if (!user || typeof user.username !== 'string') {
        return next(new Error('Недійсний токен'));
      }
      if (user.guest) {
        // Гість мусить мати id === null (не може видавати себе за реального юзера).
        if (user.id != null) return next(new Error('Недійсний токен'));
      } else {
        // Реальний юзер мусить існувати в БД (інакше — підробка id).
        if (user.id == null || !getUserById(user.id)) {
          return next(new Error('Недійсний токен'));
        }
      }
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
