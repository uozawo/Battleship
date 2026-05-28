import { useState, useRef, useEffect, useCallback } from 'react';
import {
  SHIP_SIZES,
  SHIP,
  createEmptyBoard,
  isValidPlacement,
  shipCoords,
  generateRandomFleet,
} from '@battleship/shared';
import { createGameSocket } from '../socket.js';
import { markEnemy, markOwn } from '../lib/marks.js';

const clone = (b) => b.map((row) => [...row]);

/**
 * Онлайн-матч через сокет. Сервер — авторитет; хук лише відображає стан
 * і надсилає наміри (створити/зайти/флот/постріл).
 *
 * @param token   JWT
 * @param action  'create' | 'join'
 * @param code    код кімнати (для 'join')
 * @param onFinished  колбек по завершенні (оновити статистику профілю)
 */
export function useOnlineGame({ token, action, code, onFinished }) {
  const [phase, setPhase] = useState('connecting'); // connecting|waiting|placement|battle|over
  const [status, setStatus] = useState('Зʼєднання з командним сервером…');
  const [error, setError] = useState(null);
  const [roomCode, setRoomCode] = useState(action === 'join' ? code : null);
  const [opponent, setOpponent] = useState(null);
  const [playerBoard, setPlayerBoard] = useState(createEmptyBoard);
  const [enemyBoard, setEnemyBoard] = useState(createEmptyBoard);
  const [placementIndex, setPlacementIndex] = useState(0);
  const [direction, setDirection] = useState('H');
  const [isReady, setIsReady] = useState(false);
  const [enemyReady, setEnemyReady] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [turnDeadline, setTurnDeadline] = useState(null);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState(null);

  const socketRef = useRef(null);
  const meRef = useRef({ board: createEmptyBoard(), ships: [] });
  const playerNumRef = useRef(null);
  const canFireRef = useRef(false);
  const overRef = useRef(false);
  const readyRef = useRef(false);

  // Автоматичне зникнення повідомлення про помилку.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  // ── Підключення й слухачі сокета ─────────────────────────────────────────
  useEffect(() => {
    const socket = createGameSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      if (action === 'create') socket.emit('room:create');
      else {
        socket.emit('room:join', { code });
        setStatus('Підключення до кімнати…');
      }
    });
    socket.on('connect_error', (e) => setError(e.message || 'Помилка зʼєднання'));

    socket.on('room:created', ({ code: c }) => {
      setRoomCode(c);
      setPhase('waiting');
      setStatus('Кімнату створено. Передайте код супернику.');
    });
    socket.on('room:error', ({ message }) => {
      setError(message);
      setStatus(message);
    });
    socket.on('match:placement', ({ playerNum, opponent: opp }) => {
      playerNumRef.current = playerNum;
      setOpponent(opp);
      setPhase('placement');
      setStatus('Супротивника знайдено! Розгорніть флот.');
    });
    socket.on('opponent:ready', () => setEnemyReady(true));
    socket.on('fleet:accepted', () => {
      setIsReady(true);
      readyRef.current = true;
      setStatus('Флот прийнято. Очікування суперника…');
    });
    socket.on('match:battle', ({ yourTurn }) => {
      setPhase('battle');
      setIsReady(false);
      readyRef.current = false;
      setStatus(yourTurn ? 'Бій! Ваш хід.' : 'Бій! Хід суперника.');
    });
    socket.on('turn:start', ({ playerNum, deadline }) => {
      const mine = playerNum === playerNumRef.current;
      setIsMyTurn(mine);
      canFireRef.current = mine;
      setTurnDeadline(deadline);
      setStatus(mine ? 'Ваш хід. Оберіть ціль.' : 'Хід суперника…');
    });
    socket.on('turn:timeout', ({ playerNum }) => {
      const mine = playerNum === playerNumRef.current;
      setStatus(mine ? 'Ваш час вичерпано!' : 'Суперник зволікав — ваш хід.');
    });
    socket.on('shot:result', ({ r, c, result: res, sunk, sunkCoords }) => {
      setEnemyBoard((prev) => markEnemy(prev, r, c, res, sunk, sunkCoords));
      setStatus(res === 'hit' ? (sunk ? 'Ціль знищено!' : 'Влучання!') : 'Промах.');
    });
    socket.on('shot:incoming', ({ r, c, result: res, sunk, sunkCoords }) => {
      markOwn(meRef.current.board, r, c, res, sunk, sunkCoords);
      setPlayerBoard(clone(meRef.current.board));
    });
    socket.on('game:over', ({ win, reason: rs }) => {
      overRef.current = true;
      canFireRef.current = false;
      setIsMyTurn(false);
      setTurnDeadline(null);
      setResult(win ? 'win' : 'loss');
      setReason(rs);
      setPhase('over');
      onFinished?.();
    });
    socket.on('opponent:left', ({ message }) => setStatus(message || 'Суперник вийшов'));
    socket.on('game:error', ({ message }) => {
      setError(message);
      // Повертаємо контроль, якщо сервер відхилив дію під час нашого ходу.
      if (!overRef.current && playerNumRef.current != null) {
        setIsMyTurn((prev) => {
          canFireRef.current = prev;
          return prev;
        });
      }
    });

    return () => {
      overRef.current = true;
      socket.removeAllListeners();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, action, code]);

  // ── Дії гравця ───────────────────────────────────────────────────────────
  const placeCell = useCallback(
    (r, c) => {
      if (phase !== 'placement' || readyRef.current || placementIndex >= SHIP_SIZES.length) return;
      const size = SHIP_SIZES[placementIndex];
      if (!isValidPlacement(meRef.current.board, r, c, size, direction)) return;
      const coords = shipCoords(r, c, size, direction);
      for (const { r: nr, c: nc } of coords) meRef.current.board[nr][nc] = SHIP;
      meRef.current.ships.push({ coords, hits: 0, sunk: false });
      setPlayerBoard(clone(meRef.current.board));
      setPlacementIndex(placementIndex + 1);
    },
    [phase, placementIndex, direction],
  );

  const autoPlace = useCallback(() => {
    if (readyRef.current) return;
    const { board, ships } = generateRandomFleet();
    meRef.current = { board, ships };
    setPlayerBoard(clone(board));
    setPlacementIndex(SHIP_SIZES.length);
  }, []);

  const resetPlacement = useCallback(() => {
    if (readyRef.current) return;
    meRef.current = { board: createEmptyBoard(), ships: [] };
    setPlayerBoard(createEmptyBoard());
    setPlacementIndex(0);
  }, []);

  const ready = useCallback(() => {
    if (placementIndex < SHIP_SIZES.length || readyRef.current) return;
    socketRef.current?.emit('fleet:submit', { ships: meRef.current.ships });
  }, [placementIndex]);

  const fireCell = useCallback((r, c) => {
    if (!canFireRef.current || overRef.current) return;
    canFireRef.current = false;
    setIsMyTurn(false);
    socketRef.current?.emit('fire', { r, c });
  }, []);

  const leave = useCallback(() => {
    overRef.current = true;
    socketRef.current?.emit('room:leave');
    socketRef.current?.disconnect();
  }, []);

  return {
    mode: 'online',
    phase,
    status,
    error,
    roomCode,
    opponent,
    playerBoard,
    enemyBoard,
    placement: { index: placementIndex, sizes: SHIP_SIZES, direction },
    isReady,
    enemyReady,
    isMyTurn,
    turnDeadline,
    result,
    reason,
    setDirection,
    placeCell,
    autoPlace,
    resetPlacement,
    ready,
    fireCell,
    leave,
    again: null, // онлайн — повернутися в лобі
  };
}
