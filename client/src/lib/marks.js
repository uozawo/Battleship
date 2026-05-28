import { BOARD_SIZE, EMPTY, HIT, MISS, SUNK } from '@battleship/shared';

// Обводимо потоплений корабель промахами (на копії/місці).
function surround(board, coords) {
  for (const { r, c } of coords) {
    board[r][c] = SUNK;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === EMPTY) {
          board[nr][nc] = MISS;
        }
      }
    }
  }
}

/** Нова матриця ворожого радара з нанесеним пострілом (immutable). */
export function markEnemy(prev, r, c, result, sunk, sunkCoords) {
  const b = prev.map((row) => [...row]);
  if (result === 'miss') b[r][c] = MISS;
  else if (sunk) surround(b, sunkCoords);
  else b[r][c] = HIT;
  return b;
}

/** Нанести вхідний постріл на власне поле (мутує board, що містить кораблі). */
export function markOwn(board, r, c, result, sunk, sunkCoords) {
  if (result === 'miss') board[r][c] = MISS;
  else if (sunk) surround(board, sunkCoords);
  else board[r][c] = HIT;
}
