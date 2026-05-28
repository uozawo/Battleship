import { describe, it, expect } from 'vitest';
import {
  BOARD_SIZE,
  SHIP_SIZES,
  TOTAL_SHIP_CELLS,
  EMPTY,
  SHIP,
  HIT,
  MISS,
  SUNK,
  createEmptyBoard,
  isValidPlacement,
  shipCoords,
  generateRandomFleet,
  validateFleet,
  applyShot,
  countDamage,
} from '@battleship/shared';

// Детермінований легальний флот (рядки 0,2,4,6,8 + колонки розділені порожніми).
// Набір розмірів: 4, 3,3, 2,2,2, 1,1,1,1 = 20 клітин.
function fixtureFleet() {
  return [
    { coords: shipCoords(0, 0, 4, 'H') }, // (0,0)-(0,3)
    { coords: shipCoords(2, 0, 3, 'H') }, // (2,0)-(2,2)
    { coords: shipCoords(4, 0, 3, 'H') }, // (4,0)-(4,2)
    { coords: shipCoords(6, 0, 2, 'H') }, // (6,0)-(6,1)
    { coords: shipCoords(8, 0, 2, 'H') }, // (8,0)-(8,1)
    { coords: shipCoords(0, 5, 2, 'H') }, // (0,5)-(0,6)
    { coords: [{ r: 2, c: 5 }] },
    { coords: [{ r: 4, c: 5 }] },
    { coords: [{ r: 6, c: 5 }] },
    { coords: [{ r: 8, c: 5 }] },
  ];
}

describe('константи та дошка', () => {
  it('сума розмірів кораблів = 20', () => {
    expect(TOTAL_SHIP_CELLS).toBe(20);
    expect(SHIP_SIZES.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('createEmptyBoard дає 10×10 порожніх клітин', () => {
    const b = createEmptyBoard();
    expect(b).toHaveLength(BOARD_SIZE);
    expect(b.every((row) => row.length === BOARD_SIZE)).toBe(true);
    expect(b.flat().every((cell) => cell === EMPTY)).toBe(true);
  });
});

describe('isValidPlacement', () => {
  it('дозволяє корабель у межах поля на порожній дошці', () => {
    const b = createEmptyBoard();
    expect(isValidPlacement(b, 0, 0, 4, 'H')).toBe(true);
    expect(isValidPlacement(b, 5, 9, 1, 'H')).toBe(true);
  });

  it('забороняє вихід за межі', () => {
    const b = createEmptyBoard();
    expect(isValidPlacement(b, 0, 7, 4, 'H')).toBe(false); // 7,8,9,10 -> out
    expect(isValidPlacement(b, 9, 0, 2, 'V')).toBe(false);
  });

  it('забороняє дотик до іншого корабля (навіть по діагоналі)', () => {
    const b = createEmptyBoard();
    b[0][0] = SHIP;
    expect(isValidPlacement(b, 1, 1, 1, 'H')).toBe(false); // діагональ
    expect(isValidPlacement(b, 0, 1, 1, 'H')).toBe(false); // збоку
    expect(isValidPlacement(b, 2, 2, 1, 'H')).toBe(true); // достатньо далеко
  });
});

describe('validateFleet', () => {
  it('приймає коректний флот і будує дошку з 20 клітинами кораблів', () => {
    const res = validateFleet(fixtureFleet());
    expect(res.ok).toBe(true);
    const shipCells = res.board.flat().filter((c) => c === SHIP).length;
    expect(shipCells).toBe(20);
    expect(res.ships).toHaveLength(10);
  });

  it('відхиляє невірний набір розмірів', () => {
    const bad = fixtureFleet().slice(0, 9); // лише 9 кораблів
    expect(validateFleet(bad).ok).toBe(false);
  });

  it('відхиляє кораблі, що торкаються', () => {
    const fleet = fixtureFleet();
    fleet[6] = { coords: [{ r: 1, c: 0 }] }; // торкається корабля у рядку 0
    expect(validateFleet(fleet).ok).toBe(false);
  });

  it('відхиляє непряму/розірвану лінію', () => {
    const fleet = fixtureFleet();
    fleet[0] = { coords: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 0, c: 3 }] };
    expect(validateFleet(fleet).ok).toBe(false);
  });

  it('відхиляє вихід за межі', () => {
    const fleet = fixtureFleet();
    fleet[0] = { coords: shipCoords(0, 8, 4, 'H') }; // 8,9,10,11
    expect(validateFleet(fleet).ok).toBe(false);
  });

  it('не мутує вхідні дані', () => {
    const fleet = fixtureFleet();
    const snapshot = JSON.stringify(fleet);
    validateFleet(fleet);
    expect(JSON.stringify(fleet)).toBe(snapshot);
  });
});

describe('applyShot', () => {
  it('промах по порожній клітині', () => {
    const { board, ships } = validateFleet(fixtureFleet());
    const res = applyShot(board, ships, 1, 1);
    expect(res.result).toBe('miss');
    expect(board[1][1]).toBe(MISS);
  });

  it('влучання без потоплення великого корабля', () => {
    const { board, ships } = validateFleet(fixtureFleet());
    const res = applyShot(board, ships, 0, 0); // 4-палубний
    expect(res.result).toBe('hit');
    expect(res.sunk).toBe(false);
    expect(board[0][0]).toBe(HIT);
  });

  it('потоплення одноклітинного корабля обводить промахами', () => {
    const { board, ships } = validateFleet(fixtureFleet());
    const res = applyShot(board, ships, 2, 5); // 1-палубний
    expect(res.result).toBe('hit');
    expect(res.sunk).toBe(true);
    expect(res.sunkCoords).toEqual([{ r: 2, c: 5 }]);
    expect(board[2][5]).toBe(SUNK);
    // сусідні порожні клітини стали промахами
    expect(board[1][5]).toBe(MISS);
    expect(board[3][5]).toBe(MISS);
    expect(board[2][4]).toBe(MISS);
    expect(board[2][6]).toBe(MISS);
  });

  it('повторний постріл у ту саму клітину → repeat', () => {
    const { board, ships } = validateFleet(fixtureFleet());
    applyShot(board, ships, 2, 5);
    const again = applyShot(board, ships, 2, 5);
    expect(again.result).toBe('repeat');
  });

  it('постріл за межі → invalid', () => {
    const { board, ships } = validateFleet(fixtureFleet());
    expect(applyShot(board, ships, -1, 0).result).toBe('invalid');
    expect(applyShot(board, ships, 0, 99).result).toBe('invalid');
  });

  it('перемога коли всі кораблі потоплено', () => {
    const { board, ships } = validateFleet(fixtureFleet());
    let won = false;
    for (const ship of ships) {
      for (const { r, c } of ship.coords) {
        const res = applyShot(board, ships, r, c);
        won = res.won;
      }
    }
    expect(won).toBe(true);
    expect(countDamage(board)).toBe(TOTAL_SHIP_CELLS);
  });
});

describe('generateRandomFleet', () => {
  it('створює 10 валідних кораблів на 20 клітин', () => {
    for (let i = 0; i < 50; i++) {
      const { board, ships } = generateRandomFleet();
      expect(ships).toHaveLength(10);
      expect(board.flat().filter((c) => c === SHIP).length).toBe(20);
      // згенерований флот має проходити валідацію
      expect(validateFleet(ships).ok).toBe(true);
    }
  });
});
