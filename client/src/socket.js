import { io } from 'socket.io-client';

// Підключення до того самого origin (Vite проксіює /socket.io на :3000),
// з JWT у handshake. forceNew — щоб дві вкладки мали незалежні зʼєднання.
export function createGameSocket(token) {
  return io({
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    autoConnect: true,
  });
}
