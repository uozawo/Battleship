// =============================================================================
// shared/engine.js — ЧИСТА логіка правил "Морського бою".
// Без залежностей. Імпортується сервером (авторитет) і клієнтом (бот + підказки).
// Єдине джерело правди для дошки, флоту, пострілів і перемоги.
// =============================================================================

export const BOARD_SIZE = 10;
export const SHIP_SIZES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
export const TOTAL_SHIP_CELLS = SHIP_SIZES.reduce((a, b) => a + b, 0); // 20
export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж', 'З', 'И'];

// Стани клітини
export const EMPTY = '.'; // нічого
export const SHIP = 'S'; // частина корабля (не збита)
export const HIT = 'X'; // влучання (корабель ще не потоплено)
export const MISS = 'M'; // промах
export const SUNK = 'K'; // частина потопленого корабля

// Цілі числа в межах поля. Перевірка Number.isInteger критична: без неї дробові
// координати (напр. 5.5) проходять межі, але board[5.5] === undefined → краш.
const inBounds = (r, c) =>
  Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

/** Порожня дошка 10×10. */
export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

/** Глибока копія дошки. */
export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

/**
 * Чи можна поставити корабель довжиною `size` з клітини (r,c) у напрямку dir ('H'|'V')
 * на дошку `board`. Заборонено виходити за межі, перетинатись і ТОРКАТИСЯ інших
 * кораблів (навіть по діагоналі).
 */
export function isValidPlacement(board, r, c, size, dir) {
  for (let i = 0; i < size; i++) {
    const nr = r + (dir === 'V' ? i : 0);
    const nc = c + (dir === 'H' ? i : 0);
    if (!inBounds(nr, nc)) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cr = nr + dr;
        const cc = nc + dc;
        if (inBounds(cr, cc) && board[cr][cc] === SHIP) return false;
      }
    }
  }
  return true;
}

/** Координати клітин корабля з (r,c), розміру size, напрямку dir. */
export function shipCoords(r, c, size, dir) {
  const coords = [];
  for (let i = 0; i < size; i++) {
    coords.push({
      r: r + (dir === 'V' ? i : 0),
      c: c + (dir === 'H' ? i : 0),
    });
  }
  return coords;
}

/**
 * Випадковий легальний флот.
 * @returns {{ board: string[][], ships: {coords:{r,c}[], hits:number, sunk:boolean}[] }}
 */
export function generateRandomFleet() {
  const board = createEmptyBoard();
  const ships = [];
  for (const size of SHIP_SIZES) {
    let placed = false;
    let guard = 0;
    while (!placed && guard++ < 100000) {
      const dir = Math.random() < 0.5 ? 'H' : 'V';
      const r = Math.floor(Math.random() * BOARD_SIZE);
      const c = Math.floor(Math.random() * BOARD_SIZE);
      if (isValidPlacement(board, r, c, size, dir)) {
        const coords = shipCoords(r, c, size, dir);
        for (const { r: nr, c: nc } of coords) board[nr][nc] = SHIP;
        ships.push({ coords, hits: 0, sunk: false });
        placed = true;
      }
    }
    if (!placed) {
      // Вкрай малоймовірно: рестарт усієї розстановки.
      return generateRandomFleet();
    }
  }
  return { board, ships };
}

/** Чи координати утворюють прямий безперервний відрізок. */
function isStraightContiguous(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return false;
  if (coords.some((p) => !Number.isInteger(p?.r) || !Number.isInteger(p?.c))) return false;
  if (coords.length === 1) return true;

  const rows = coords.map((p) => p.r);
  const cols = coords.map((p) => p.c);
  const sameRow = rows.every((r) => r === rows[0]);
  const sameCol = cols.every((c) => c === cols[0]);

  const consecutive = (vals) => {
    const s = [...vals].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1]) return false; // дублікат клітини
      if (s[i] !== s[i - 1] + 1) return false; // розрив
    }
    return true;
  };

  if (sameRow && !sameCol) return consecutive(cols);
  if (sameCol && !sameRow) return consecutive(rows);
  return false; // не пряма лінія (або одна клітина обробляється вище)
}

/**
 * Валідація поданого клієнтом флоту. Перевіряє: кількість/розміри кораблів,
 * прямизну й безперервність кожного, межі поля, відсутність перетину/дотику.
 * Викликається СЕРВЕРОМ (авторитет) перед збереженням.
 * @returns {{ ok:true, board, ships } | { ok:false, reason:string }}
 */
export function validateFleet(rawShips) {
  if (!Array.isArray(rawShips)) return { ok: false, reason: 'Флот має бути масивом' };

  const wantSizes = [...SHIP_SIZES].sort((a, b) => a - b).join(',');
  const gotSizes = rawShips
    .map((s) => (Array.isArray(s?.coords) ? s.coords.length : -1))
    .sort((a, b) => a - b)
    .join(',');
  if (wantSizes !== gotSizes) return { ok: false, reason: 'Невірний набір кораблів' };

  const board = createEmptyBoard();
  for (const ship of rawShips) {
    const coords = ship.coords;
    if (!isStraightContiguous(coords)) {
      return { ok: false, reason: 'Корабель не є прямою безперервною лінією' };
    }
    // Перевірка меж і дотику до ВЖЕ поставлених кораблів.
    for (const { r, c } of coords) {
      if (!inBounds(r, c)) return { ok: false, reason: 'Корабель за межами поля' };
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const cr = r + dr;
          const cc = c + dc;
          if (inBounds(cr, cc) && board[cr][cc] === SHIP) {
            return { ok: false, reason: 'Кораблі перетинаються або торкаються' };
          }
        }
      }
    }
    for (const { r, c } of coords) board[r][c] = SHIP;
  }

  const ships = rawShips.map((s) => ({
    coords: s.coords.map(({ r, c }) => ({ r, c })),
    hits: 0,
    sunk: false,
  }));
  return { ok: true, board, ships };
}

/** Обвести потоплений корабель промахами (клітини навколо стають недоступними). */
function surroundSunk(board, coords) {
  for (const { r, c } of coords) {
    board[r][c] = SUNK;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && board[nr][nc] === EMPTY) board[nr][nc] = MISS;
      }
    }
  }
}

/**
 * Постріл по (r,c) на дошці `board` з флотом `ships`. МУТУЄ board і ships.
 * @returns {{ result:'hit'|'miss'|'repeat'|'invalid', sunk:boolean,
 *             sunkCoords:{r,c}[], won:boolean }}
 */
export function applyShot(board, ships, r, c) {
  if (!inBounds(r, c)) return { result: 'invalid', sunk: false, sunkCoords: [], won: false };
  const cell = board[r][c];
  if (cell === HIT || cell === MISS || cell === SUNK) {
    return { result: 'repeat', sunk: false, sunkCoords: [], won: false };
  }
  if (cell === EMPTY) {
    board[r][c] = MISS;
    return { result: 'miss', sunk: false, sunkCoords: [], won: false };
  }

  // cell === SHIP
  board[r][c] = HIT;
  const ship = ships.find((s) => s.coords.some((p) => p.r === r && p.c === c));
  let sunk = false;
  let sunkCoords = [];
  if (ship) {
    ship.hits += 1;
    if (ship.hits >= ship.coords.length) {
      ship.sunk = true;
      sunk = true;
      sunkCoords = ship.coords.map(({ r: pr, c: pc }) => ({ r: pr, c: pc }));
      surroundSunk(board, ship.coords);
    }
  }
  const won = ships.every((s) => s.sunk);
  return { result: 'hit', sunk, sunkCoords, won };
}

/** Кількість збитих клітин (X+K) — для індикаторів прогресу. */
export function countDamage(board) {
  let n = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === HIT || board[r][c] === SUNK) n += 1;
    }
  }
  return n;
}
