import { validateFleet, applyShot } from '@battleship/shared';
import { recordResult } from './db.js';

const TURN_MS = 30_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без плутаних 0/O/1/I
const CODE_LEN = 4;

/**
 * Авторитарний менеджер кімнат. Зберігає поля обох гравців у себе, перевіряє
 * кожен постріл, веде чергу ходів і серверний таймер. Клієнт лише відображає.
 */
export function createRoomManager(io) {
  const rooms = new Map(); // code -> room
  const socketToCode = new Map(); // socketId -> code

  function makeCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LEN }, () =>
        CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
      ).join('');
    } while (rooms.has(code));
    return code;
  }

  function mkPlayer(socket) {
    return {
      socketId: socket.id,
      user: socket.data.user, // { id, username, guest }
      board: null,
      ships: null,
      ready: false,
    };
  }

  function roomOfSocket(socket) {
    const code = socketToCode.get(socket.id);
    return code ? rooms.get(code) : null;
  }

  function indexInRoom(room, socketId) {
    return room.players.findIndex((p) => p && p.socketId === socketId);
  }

  function clearTimer(room) {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
  }

  function cleanup(room) {
    clearTimer(room);
    for (const p of room.players) {
      if (p) socketToCode.delete(p.socketId);
    }
    rooms.delete(room.code);
  }

  // ── Дії клієнта ───────────────────────────────────────────────────────────

  function createRoom(socket) {
    if (roomOfSocket(socket)) leave(socket); // на випадок повторного створення
    const code = makeCode();
    const room = {
      code,
      state: 'waiting',
      players: [mkPlayer(socket)],
      turn: 0,
      turnDeadline: null,
      turnTimer: null,
    };
    rooms.set(code, room);
    socketToCode.set(socket.id, code);
    socket.join(code);
    socket.emit('room:created', { code });
  }

  function joinRoom(socket, code) {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return socket.emit('room:error', { message: 'Кімнату не знайдено' });
    if (room.players.length >= 2) {
      return socket.emit('room:error', { message: 'Кімната вже заповнена' });
    }
    if (roomOfSocket(socket)) leave(socket);

    room.players.push(mkPlayer(socket));
    socketToCode.set(socket.id, code);
    socket.join(code);
    room.state = 'placement';

    // Кожному гравцю — його номер і імʼя суперника; сигнал почати розстановку.
    room.players.forEach((p, i) => {
      const opponent = room.players[1 - i];
      io.to(p.socketId).emit('match:placement', {
        playerNum: i + 1,
        opponent: opponent.user.username,
      });
    });
  }

  function submitFleet(socket, rawShips) {
    const room = roomOfSocket(socket);
    if (!room || room.state !== 'placement') {
      return socket.emit('game:error', { message: 'Зараз не фаза розстановки' });
    }
    const idx = indexInRoom(room, socket.id);
    const player = room.players[idx];
    if (player.ready) return; // вже подав

    const res = validateFleet(rawShips);
    if (!res.ok) {
      return socket.emit('game:error', { message: 'Невірна розстановка: ' + res.reason });
    }
    player.board = res.board;
    player.ships = res.ships;
    player.ready = true;
    socket.emit('fleet:accepted');

    const opponent = room.players[1 - idx];
    io.to(opponent.socketId).emit('opponent:ready');

    if (room.players.length === 2 && room.players.every((p) => p.ready)) {
      startBattle(room);
    }
  }

  function fire(socket, r, c) {
    const room = roomOfSocket(socket);
    if (!room || room.state !== 'battle') {
      return socket.emit('game:error', { message: 'Зараз не фаза бою' });
    }
    const idx = indexInRoom(room, socket.id);
    if (idx !== room.turn) {
      return socket.emit('game:error', { message: 'Зараз не ваш хід' });
    }

    const opponent = room.players[1 - idx];
    const shot = applyShot(opponent.board, opponent.ships, Number(r), Number(c));

    if (shot.result === 'invalid' || shot.result === 'repeat') {
      return socket.emit('game:error', { message: 'Недопустимий постріл' });
    }

    const payload = {
      r: Number(r),
      c: Number(c),
      result: shot.result, // 'hit' | 'miss'
      sunk: shot.sunk,
      sunkCoords: shot.sunkCoords,
    };
    // Стрільцю — оновлення ворожого радара; цілі — постріл по власному полю.
    io.to(socket.id).emit('shot:result', payload);
    io.to(opponent.socketId).emit('shot:incoming', payload);

    if (shot.won) {
      return finishGame(room, idx, 'fleet-destroyed');
    }
    if (shot.result === 'miss') {
      room.turn = 1 - idx; // хід переходить
    }
    // влучив (не переміг) → ходить ще; промах → новий гравець. У будь-якому разі — рестарт таймера.
    startTurn(room);
  }

  // ── Внутрішнє ───────────────────────────────────────────────────────────

  function startBattle(room) {
    room.state = 'battle';
    room.turn = 0; // господар ходить першим
    room.players.forEach((p, i) => {
      io.to(p.socketId).emit('match:battle', { yourTurn: i === room.turn });
    });
    startTurn(room);
  }

  function startTurn(room) {
    clearTimer(room);
    room.turnDeadline = Date.now() + TURN_MS;
    io.to(room.code).emit('turn:start', {
      playerNum: room.turn + 1,
      deadline: room.turnDeadline,
    });
    const turnAtStart = room.turn;
    room.turnTimer = setTimeout(() => onTimeout(room, turnAtStart), TURN_MS);
  }

  function onTimeout(room, turnAtStart) {
    if (!rooms.has(room.code) || room.state !== 'battle' || room.turn !== turnAtStart) return;
    io.to(room.code).emit('turn:timeout', { playerNum: room.turn + 1 });
    room.turn = 1 - room.turn;
    startTurn(room);
  }

  function finishGame(room, winnerIndex, reason) {
    clearTimer(room);
    room.state = 'finished';
    const winner = room.players[winnerIndex];
    const loser = room.players[1 - winnerIndex];

    if (winner && !winner.user.guest && winner.user.id != null) recordResult(winner.user.id, true);
    if (loser && !loser.user.guest && loser.user.id != null) recordResult(loser.user.id, false);

    if (winner) io.to(winner.socketId).emit('game:over', { win: true, reason });
    if (loser) io.to(loser.socketId).emit('game:over', { win: false, reason });
    cleanup(room);
  }

  function leave(socket) {
    const room = roomOfSocket(socket);
    if (!room) return;
    const idx = indexInRoom(room, socket.id);
    const opponent = room.players[1 - idx];

    socketToCode.delete(socket.id);
    socket.leave(room.code);

    if (room.state === 'battle' && opponent) {
      // Технічна перемога суперника.
      const winnerIdx = 1 - idx;
      // Переможець — той, хто лишився; той, хто вийшов, отримує поразку.
      if (!opponent.user.guest && opponent.user.id != null) recordResult(opponent.user.id, true);
      const leaver = room.players[idx];
      if (leaver && !leaver.user.guest && leaver.user.id != null) recordResult(leaver.user.id, false);
      io.to(opponent.socketId).emit('opponent:left', { message: 'Суперник вийшов' });
      io.to(opponent.socketId).emit('game:over', { win: true, reason: 'opponent-left' });
      void winnerIdx;
      cleanup(room);
    } else if (opponent) {
      // До бою — просто повідомити й закрити кімнату.
      io.to(opponent.socketId).emit('opponent:left', { message: 'Суперник вийшов' });
      cleanup(room);
    } else {
      cleanup(room);
    }
  }

  function handleConnection(socket) {
    socket.on('room:create', () => createRoom(socket));
    socket.on('room:join', ({ code } = {}) => joinRoom(socket, code));
    socket.on('fleet:submit', ({ ships } = {}) => submitFleet(socket, ships));
    socket.on('fire', ({ r, c } = {}) => fire(socket, r, c));
    socket.on('room:leave', () => leave(socket));
    socket.on('disconnect', () => leave(socket));
  }

  return { handleConnection, _rooms: rooms };
}
