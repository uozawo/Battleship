import { useState } from 'react';
import {
  BOARD_SIZE,
  LETTERS,
  EMPTY,
  SHIP,
  HIT,
  MISS,
  SUNK,
  isValidPlacement,
  shipCoords,
} from '@battleship/shared';

/**
 * Ігрова дошка 10×10 з координатними підписами.
 *
 * @param board     матриця станів
 * @param variant   'own' — показує кораблі; 'enemy' — лише розкриті влучання/промахи
 * @param onCellClick(r,c)
 * @param radar     показати сонар-промінь (радар ворога в бою)
 * @param placement { size, dir } — увімкнути прев'ю розстановки під час наведення (own)
 * @param interactive чи реагують клітини на клік
 */
export default function Board({
  board,
  variant = 'own',
  onCellClick,
  radar = false,
  placement = null,
  interactive = false,
}) {
  const [hover, setHover] = useState(null); // {r,c}

  // Клітини прев'ю при розстановці.
  let previewSet = new Set();
  let previewValid = true;
  if (placement && hover) {
    const coords = shipCoords(hover.r, hover.c, placement.size, placement.dir);
    previewValid = isValidPlacement(board, hover.r, hover.c, placement.size, placement.dir);
    for (const { r, c } of coords) {
      if (r < BOARD_SIZE && c < BOARD_SIZE) previewSet.add(`${r},${c}`);
    }
  }

  const cells = [];
  cells.push(<div key="corner" className="board__lbl" />);
  for (let c = 0; c < BOARD_SIZE; c++) {
    cells.push(
      <div key={`h${c}`} className="board__lbl">
        {LETTERS[c]}
      </div>,
    );
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    cells.push(
      <div key={`v${r}`} className="board__lbl">
        {r + 1}
      </div>,
    );
    for (let c = 0; c < BOARD_SIZE; c++) {
      const val = board[r][c];
      const classes = ['cell'];

      if (variant === 'own' && val === SHIP) classes.push('cell--ship');
      if (val === HIT) classes.push('cell--hit');
      if (val === MISS) classes.push('cell--miss');
      if (val === SUNK) classes.push('cell--sunk');

      // Прев'ю розстановки
      const key = `${r},${c}`;
      if (previewSet.has(key)) classes.push(previewValid ? 'cell--preview' : 'cell--preview-bad');

      // Клікабельність радара ворога: лише ще не обстріляні клітини
      const shotAlready = val === HIT || val === MISS || val === SUNK;
      const playable = interactive && variant === 'enemy' && !shotAlready;
      if (playable) classes.push('cell--play');

      const clickable = interactive && (variant === 'own' ? !!placement : playable);

      cells.push(
        <div
          key={key}
          className={classes.join(' ')}
          onClick={clickable ? () => onCellClick?.(r, c) : undefined}
          onMouseEnter={placement ? () => setHover({ r, c }) : undefined}
          onMouseLeave={placement ? () => setHover(null) : undefined}
        />,
      );
    }
  }

  return (
    <div className={`board-frame ${radar ? 'board-frame--radar' : ''}`}>
      {radar && <div className="radar-sweep" />}
      <div className={`board ${placement ? 'board--placing' : ''}`}>{cells}</div>
    </div>
  );
}
