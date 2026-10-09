import type { GameEngine } from "./types";

export interface CheckerPiece {
  /** 0 = player one (light, moves up), 1 = player two (dark, moves down) */
  p: 0 | 1;
  king: boolean;
}

export interface CheckersMove {
  from: number;
  to: number;
  /** First captured square (kept for compatibility with older callers). */
  captured?: number;
  /** Every landing square in a complete multi-capture move. */
  path?: number[];
  /** All enemy squares removed when this move is applied. */
  capturedPieces?: number[];
}

export interface CheckersState {
  board: (CheckerPiece | null)[];
  turn: 0 | 1;
  /** During a chain capture, only this square may move. */
  chain: number | null;
  /** Number of captures still required to complete the majority capture. */
  chainRemaining?: number;
  over: boolean;
  winner: number | null;
  lastMove: CheckersMove | null;
}

const rank = (i: number) => Math.floor(i / 8);
const file = (i: number) => i % 8;
const idx = (r: number, f: number) => r * 8 + f;
const on = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;

export function checkersTimeout(state: CheckersState): CheckersState {
  if (state.over) return state;
  const moves = legalMoves(state);
  if (!moves.length) return state;
  return checkersEngine.applyMove(state, moves[Math.floor(Math.random() * moves.length)]!);
}

export const isDarkSquare = (i: number) => (rank(i) + file(i)) % 2 === 1;

function clone(s: CheckersState): CheckersState {
  return { ...s, board: s.board.map((p) => (p ? { ...p } : null)) };
}

/** Generate one-step captures. Brazilian draughts men capture forwards and backwards;
 * flying kings may land on any empty square beyond the captured piece on that diagonal. */
function capturesFor(board: (CheckerPiece | null)[], from: number): CheckersMove[] {
  const piece = board[from];
  if (!piece) return [];
  const out: CheckersMove[] = [];
  for (const [dr, df] of DIRECTIONS) {
    let r = rank(from) + dr;
    let f = file(from) + df;
    if (!piece.king) {
      if (!on(r, f)) continue;
      const target = idx(r, f);
      const enemy = board[target];
      const lr = r + dr;
      const lf = f + df;
      if (enemy && enemy.p !== piece.p && on(lr, lf) && !board[idx(lr, lf)]) {
        out.push({ from, to: idx(lr, lf), captured: target });
      }
      continue;
    }

    // A flying king can pass over empty squares, capture one enemy, then land
    // on any empty square after it. A second piece or own piece blocks the ray.
    while (on(r, f) && !board[idx(r, f)]) {
      r += dr;
      f += df;
    }
    if (!on(r, f)) continue;
    const target = idx(r, f);
    const enemy = board[target];
    if (!enemy || enemy.p === piece.p) continue;
    r += dr;
    f += df;
    while (on(r, f) && !board[idx(r, f)]) {
      out.push({ from, to: idx(r, f), captured: target });
      r += dr;
      f += df;
    }
  }
  return out;
}

/** Non-capturing moves: men step one square forwards, flying kings slide any distance. */
function ordinaryMoves(board: (CheckerPiece | null)[], from: number): CheckersMove[] {
  const piece = board[from];
  if (!piece) return [];
  const out: CheckersMove[] = [];
  const forward = piece.p === 0 ? -1 : 1;
  for (const [dr, df] of DIRECTIONS) {
    if (!piece.king && dr !== forward) continue;
    let r = rank(from) + dr;
    let f = file(from) + df;
    while (on(r, f) && !board[idx(r, f)]) {
      out.push({ from, to: idx(r, f) });
      if (!piece.king) break;
      r += dr;
      f += df;
    }
  }
  return out;
}

function boardAfterCapture(board: (CheckerPiece | null)[], move: CheckersMove) {
  const next = board.map((p) => (p ? { ...p } : null));
  next[move.to] = next[move.from];
  next[move.from] = null;
  if (move.captured !== undefined) next[move.captured] = null;
  return next;
}

/** Enumerate every complete capture route. Captures are resolved together as one turn. */
function captureSequences(board: (CheckerPiece | null)[], from: number): CheckersMove[] {
  if (!board[from]) return [];
  const walk = (
    position: number,
    currentBoard: (CheckerPiece | null)[],
    path: number[],
    taken: number[],
  ): CheckersMove[] => {
    const nextCaptures = capturesFor(currentBoard, position);
    if (!nextCaptures.length) {
      return taken.length
        ? [{ from, to: position, captured: taken[0], path: [...path], capturedPieces: [...taken] }]
        : [];
    }
    const routes: CheckersMove[] = [];
    for (const step of nextCaptures) {
      if (step.captured === undefined) continue;
      const after = boardAfterCapture(currentBoard, step);
      routes.push(...walk(step.to, after, [...path, step.to], [...taken, step.captured]));
    }
    return routes;
  };
  return walk(from, board, [], []);
}

export function legalMoves(s: CheckersState): CheckersMove[] {
  if (s.over) return [];
  const captures: CheckersMove[] = [];
  for (let i = 0; i < 64; i++) {
    if (s.board[i]?.p === s.turn) captures.push(...captureSequences(s.board, i));
  }
  // House rule: a player may choose any complete capture route, not only the
  // route that takes the maximum number of pieces.
  if (captures.length) return captures;

  const moves: CheckersMove[] = [];
  for (let i = 0; i < 64; i++) {
    if (s.board[i]?.p === s.turn) moves.push(...ordinaryMoves(s.board, i));
  }
  return moves;
}

export const checkersEngine: GameEngine<CheckersState, CheckersMove> = {
  id: "checkers",
  name: "Damas",
  minPlayers: 2,
  maxPlayers: 2,
  createGame() {
    const board: (CheckerPiece | null)[] = Array.from({ length: 64 }, () => null);
    for (let i = 0; i < 64; i++) {
      if (!isDarkSquare(i)) continue;
      if (rank(i) < 3) board[i] = { p: 1, king: false };
      if (rank(i) > 4) board[i] = { p: 0, king: false };
    }
    return { board, turn: 0, chain: null, chainRemaining: undefined, over: false, winner: null, lastMove: null };
  },
  validateMove(state, move) {
    const signature = (m: CheckersMove) => JSON.stringify({
      from: m.from,
      to: m.to,
      path: m.path ?? [m.to],
      capturedPieces: m.capturedPieces ?? (m.captured === undefined ? [] : [m.captured]),
    });
    return legalMoves(state).some((m) => signature(m) === signature(move));
  },
  applyMove(state, move) {
    if (!checkersEngine.validateMove(state, move)) return state;
    const n = clone(state);
    const piece = n.board[move.from]!;
    const taken = move.capturedPieces ?? (move.captured === undefined ? [] : [move.captured]);
    n.board[move.from] = null;
    n.board[move.to] = piece;
    for (const square of taken) n.board[square] = null;

    const crownRank = piece.p === 0 ? 0 : 7;
    if (!piece.king && rank(move.to) === crownRank) piece.king = true;
    n.lastMove = { ...move, path: [...(move.path ?? [move.to])], capturedPieces: [...taken] };
    n.chain = null;
    n.chainRemaining = undefined;
    n.turn = state.turn === 0 ? 1 : 0;

    if (n.board.filter((p) => p && p.p === n.turn).length === 0 || legalMoves(n).length === 0) {
      n.over = true;
      n.winner = state.turn;
    }
    return n;
  },
  getState: (s) => s,
  isGameOver: (s) => s.over,
  getWinner: (s) => s.winner,
  legalMoves,
};
