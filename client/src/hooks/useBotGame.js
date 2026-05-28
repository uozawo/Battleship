import { useState, useRef, useEffect, useCallback } from 'react';
import {
  SHIP_SIZES,
  BOARD_SIZE,
  EMPTY,
  SHIP,
  createEmptyBoard,
  isValidPlacement,
  shipCoords,
  generateRandomFleet,
  applyShot,
} from '@battleship/shared';

const TURN_MS = 30_000;
const BOT_DELAY = 700;
const clone = (b) => b.map((row) => [...row]);

/**
 * Офлайн-матч проти ШІ. Уся логіка локальна (та сама shared/engine.js).
 * Тренування — НЕ впливає на серверний рейтинг.
 */
export function useBotGame() {
  const [phase, setPhase] = useState('placement'); // placement | battle | over
  const [status, setStatus] = useState('Розгорніть свій флот, капітане.');
  const [playerBoard, setPlayerBoard] = useState(createEmptyBoard);
  const [enemyBoard, setEnemyBoard] = useState(createEmptyBoard);
  const [placementIndex, setPlacementIndex] = useState(0);
  const [direction, setDirection] = useState('H');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [turnDeadline, setTurnDeadline] = useState(null);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState(null);

  const meRef = useRef({ board: createEmptyBoard(), ships: [] }); // флот гравця
  const foeRef = useRef({ board: createEmptyBoard(), ships: [] }); // прихований флот бота
  const aiRef = useRef({ queue: [] });
  const overRef = useRef(false);
  const myTurnRef = useRef(false);
  const timers = useRef([]);

  const pushTimer = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  // Ворожий радар: ховаємо нерозкриті кораблі.
  const revealEnemy = () => {
    setEnemyBoard(
      foeRef.current.board.map((row) => row.map((c) => (c === SHIP || c === EMPTY ? EMPTY : c))),
    );
  };

  const startPlayerTurn = () => {
    setIsMyTurn(true);
    myTurnRef.current = true;
    setTurnDeadline(Date.now() + TURN_MS);
    setStatus('Ваш хід. Оберіть ціль на радарі.');
  };

  const endGame = (res, rs) => {
    overRef.current = true;
    clearTimers();
    setIsMyTurn(false);
    myTurnRef.current = false;
    setTurnDeadline(null);
    setResult(res);
    setReason(rs);
    setPhase('over');
    setStatus(res === 'win' ? 'Ворожий флот знищено!' : 'Ваш флот знищено.');
  };

  // ── Хід бота ───────────────────────────────────────────────────────────
  const botTurn = useCallback(() => {
    if (overRef.current) return;
    const ai = aiRef.current;
    const board = meRef.current.board;

    let target = null;
    while (ai.queue.length && !target) {
      const cand = ai.queue.shift();
      const v = board[cand.r][cand.c];
      if (v === EMPTY || v === SHIP) target = cand;
    }
    if (!target) {
      const opts = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const v = board[r][c];
          if (v === EMPTY || v === SHIP) opts.push({ r, c });
        }
      }
      if (!opts.length) return;
      // Перевага «шахового» патерну — ефективніший пошук.
      const parity = opts.filter((o) => (o.r + o.c) % 2 === 0);
      const pool = parity.length ? parity : opts;
      target = pool[Math.floor(Math.random() * pool.length)];
    }

    const res = applyShot(board, meRef.current.ships, target.r, target.c);
    setPlayerBoard(clone(board));

    if (res.result === 'hit') {
      if (res.sunk) {
        ai.queue = [];
      } else {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = target.r + dr;
          const nc = target.c + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
            const v = board[nr][nc];
            if (v === EMPTY || v === SHIP) ai.queue.push({ r: nr, c: nc });
          }
        }
      }
      if (res.won) return endGame('loss', 'all-sunk');
      setStatus(res.sunk ? 'Ворог потопив ваш корабель!' : 'Ворог влучив! Атакує знову…');
      pushTimer(botTurn, BOT_DELAY);
    } else {
      startPlayerTurn();
    }
  }, []);

  // Таймаут ходу гравця → передаємо хід боту.
  useEffect(() => {
    if (phase !== 'battle' || !isMyTurn || !turnDeadline) return;
    const t = setTimeout(
      () => {
        if (overRef.current || !myTurnRef.current) return;
        setStatus('Час вийшов! Хід ворога.');
        setIsMyTurn(false);
        myTurnRef.current = false;
        setTurnDeadline(null);
        pushTimer(botTurn, BOT_DELAY);
      },
      Math.max(0, turnDeadline - Date.now()),
    );
    return () => clearTimeout(t);
  }, [phase, isMyTurn, turnDeadline, botTurn]);

  // ── Дії гравця ───────────────────────────────────────────────────────────
  const placeCell = useCallback(
    (r, c) => {
      if (phase !== 'placement' || placementIndex >= SHIP_SIZES.length) return;
      const size = SHIP_SIZES[placementIndex];
      if (!isValidPlacement(meRef.current.board, r, c, size, direction)) return;
      const coords = shipCoords(r, c, size, direction);
      for (const { r: nr, c: nc } of coords) meRef.current.board[nr][nc] = SHIP;
      meRef.current.ships.push({ coords, hits: 0, sunk: false });
      setPlayerBoard(clone(meRef.current.board));
      const next = placementIndex + 1;
      setPlacementIndex(next);
      setStatus(
        next >= SHIP_SIZES.length
          ? 'Флот розгорнуто. Підтвердіть готовність.'
          : 'Розгорніть свій флот, капітане.',
      );
    },
    [phase, placementIndex, direction],
  );

  const autoPlace = useCallback(() => {
    if (phase !== 'placement') return;
    const { board, ships } = generateRandomFleet();
    meRef.current = { board, ships };
    setPlayerBoard(clone(board));
    setPlacementIndex(SHIP_SIZES.length);
    setStatus('Флот розгорнуто. Підтвердіть готовність.');
  }, [phase]);

  const resetPlacement = useCallback(() => {
    if (phase !== 'placement') return;
    meRef.current = { board: createEmptyBoard(), ships: [] };
    setPlayerBoard(createEmptyBoard());
    setPlacementIndex(0);
    setStatus('Розгорніть свій флот, капітане.');
  }, [phase]);

  const ready = useCallback(() => {
    if (placementIndex < SHIP_SIZES.length) return;
    const { board, ships } = generateRandomFleet();
    foeRef.current = { board, ships };
    aiRef.current = { queue: [] };
    overRef.current = false;
    revealEnemy();
    setResult(null);
    setReason(null);
    setPhase('battle');
    startPlayerTurn();
  }, [placementIndex]);

  const fireCell = useCallback(
    (r, c) => {
      if (phase !== 'battle' || !myTurnRef.current || overRef.current) return;
      const res = applyShot(foeRef.current.board, foeRef.current.ships, r, c);
      if (res.result === 'repeat' || res.result === 'invalid') return;
      revealEnemy();
      if (res.won) return endGame('win', 'fleet-destroyed');
      if (res.result === 'miss') {
        setStatus('Промах. Хід ворога.');
        setIsMyTurn(false);
        myTurnRef.current = false;
        setTurnDeadline(null);
        pushTimer(botTurn, BOT_DELAY);
      } else {
        setStatus(res.sunk ? 'Ціль знищено! Стріляйте ще.' : 'Влучання! Стріляйте ще.');
        setTurnDeadline(Date.now() + TURN_MS);
      }
    },
    [phase, botTurn],
  );

  const leave = useCallback(() => {
    overRef.current = true;
    clearTimers();
  }, []);

  const again = useCallback(() => {
    clearTimers();
    overRef.current = false;
    myTurnRef.current = false;
    meRef.current = { board: createEmptyBoard(), ships: [] };
    foeRef.current = { board: createEmptyBoard(), ships: [] };
    aiRef.current = { queue: [] };
    setPlayerBoard(createEmptyBoard());
    setEnemyBoard(createEmptyBoard());
    setPlacementIndex(0);
    setDirection('H');
    setIsMyTurn(false);
    setTurnDeadline(null);
    setResult(null);
    setReason(null);
    setPhase('placement');
    setStatus('Розгорніть свій флот, капітане.');
  }, []);

  return {
    mode: 'bot',
    phase,
    status,
    error: null,
    roomCode: null,
    opponent: 'ШІ «ПОСЕЙДОН»',
    playerBoard,
    enemyBoard,
    placement: { index: placementIndex, sizes: SHIP_SIZES, direction },
    isReady: false,
    enemyReady: false,
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
    again,
  };
}
