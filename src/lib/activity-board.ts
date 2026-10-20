/** Pure authoritative rules; no client-supplied scores or board state are trusted. */
export type BoardKind = "four_in_row" | "reversi";
export type Disc = 0 | 1 | 2;
export interface BoardState {
  cells: Disc[];
  turn: 1 | 2;
  winner: 0 | 1 | 2 | null;
  lastMove: number | null;
  passed: boolean;
}
export function isBoardKind(kind: string): kind is BoardKind {
  return kind === "four_in_row" || kind === "reversi";
}
export function initialBoard(kind: BoardKind): BoardState {
  const cells: Disc[] = Array(kind === "reversi" ? 64 : 42).fill(0);
  if (kind === "reversi") {
    cells[27] = 2;
    cells[28] = 1;
    cells[35] = 1;
    cells[36] = 2;
  }
  return { cells, turn: 1, winner: null, lastMove: null, passed: false };
}
const directions = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
export function reversiFlips(
  cells: Disc[],
  index: number,
  side: 1 | 2,
): number[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 64 ||
    cells[index] !== 0
  )
    return [];
  const result: number[] = [];
  for (const [dr, dc] of directions) {
    let r = Math.floor(index / 8) + dr,
      c = (index % 8) + dc;
    const line: number[] = [];
    while (
      r >= 0 &&
      r < 8 &&
      c >= 0 &&
      c < 8 &&
      cells[r * 8 + c] === 3 - side
    ) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (
      line.length &&
      r >= 0 &&
      r < 8 &&
      c >= 0 &&
      c < 8 &&
      cells[r * 8 + c] === side
    )
      result.push(...line);
  }
  return result;
}
export function legalBoardMoves(
  kind: BoardKind,
  state: BoardState,
  side: 1 | 2 = state.turn,
): number[] {
  if (state.winner !== null) return [];
  return kind === "four_in_row"
    ? [0, 1, 2, 3, 4, 5, 6].filter((col) => state.cells[col] === 0)
    : state.cells.flatMap((_, i) =>
        reversiFlips(state.cells, i, side).length ? [i] : [],
      );
}
export function moveBoard(
  kind: BoardKind,
  state: BoardState,
  side: 1 | 2,
  move: number,
): BoardState {
  if (state.winner !== null) throw new Error("This match has finished.");
  if (side !== state.turn) throw new Error("Wait for your turn.");
  if (
    !Number.isInteger(move) ||
    !legalBoardMoves(kind, state, side).includes(move)
  )
    throw new Error("Choose a legal move.");
  const cells = [...state.cells];
  let index = move;
  if (kind === "four_in_row") {
    for (let row = 5; row >= 0; row--) {
      if (cells[row * 7 + move] === 0) {
        index = row * 7 + move;
        break;
      }
    }
    cells[index] = side;
    const row = Math.floor(index / 7),
      col = index % 7;
    for (const [dr, dc] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      let count = 1;
      for (const sign of [-1, 1]) {
        let r = row + dr * sign,
          c = col + dc * sign;
        while (
          r >= 0 &&
          r < 6 &&
          c >= 0 &&
          c < 7 &&
          cells[r * 7 + c] === side
        ) {
          count++;
          r += dr * sign;
          c += dc * sign;
        }
      }
      if (count >= 4)
        return {
          cells,
          turn: side,
          winner: side,
          lastMove: index,
          passed: false,
        };
    }
    return {
      cells,
      turn: (3 - side) as 1 | 2,
      winner: cells.includes(0) ? null : 0,
      lastMove: index,
      passed: false,
    };
  }
  for (const i of reversiFlips(cells, move, side)) cells[i] = side;
  cells[move] = side;
  const next: BoardState = {
    cells,
    turn: (3 - side) as 1 | 2,
    winner: null,
    lastMove: move,
    passed: false,
  };
  if (legalBoardMoves(kind, next).length) return next;
  next.turn = side;
  next.passed = true;
  if (legalBoardMoves(kind, next).length) return next;
  const one = cells.filter((v) => v === 1).length,
    two = cells.filter((v) => v === 2).length;
  return { ...next, winner: one === two ? 0 : one > two ? 1 : 2 };
}
