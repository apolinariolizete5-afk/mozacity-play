import type { GameEngine } from "./types";

export interface CheckerPiece {
  /** 0 = player one (light, moves up), 1 = player two (dark, moves down) */
  p: 0 | 1;
  king: boolean;
}

export interface CheckersMove {
  from: number;
  to: number;
  /** Exact square of the captured piece; kings can capture from a distance. */
  captured?: number;
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
const isCapture = (m: CheckersMove) => m.captured !== undefined;

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

function boardAfterCapture(board: (CheckerPiece | null)[], move: CheckersMove) {
  const next = board.map((p) => (p ? { ...p } : null));
  next[move.to] = next[move.from];
  next[move.from] = null;
  if (move.captured !== undefined) next[move.captured] = null;
  return next;
}

/** Maximum number of pieces this piece can capture from this position. */
function maxCaptureDepth(board: (CheckerPiece | null)[], from: number): number {
  let best = 0;
  for (const move of capturesFor(board, from)) {
    best = Math.max(best, 1 + maxCaptureDepth(boardAfterCapture(board, move), move.to));
  }
  return best;
}

function ordinaryMoves(board: (CheckerPiece | null)[], from: number): CheckersMove[] {
  const piece = board[from];
  if (!piece) return [];
  const out: CheckersMove[] = [];
  if (piece.king) {
    for (const [dr, df] of DIRECTIONS) {
      let r = rank(from) + dr;
      let f = file(from) + df;
      while (on(r, f) && !board[idx(r, f)]) {
        out.push({ from, to: idx(r, f) });
        r += dr;
        f += df;
      }
    }
  } else {
    const dr = piece.p === 0 ? -1 : 1;
    for (const df of [-1, 1]) {
      const r = rank(from) + dr;
      const f = file(from) + df;
      if (on(r, f) && !board[idx(r, f)]) out.push({ from, to: idx(r, f) });
    }
  }
  return out;
}

function bestCaptureMovesForPiece(board: (CheckerPiece | null)[], from: number, requiredDepth?: number): CheckersMove[] {
  return capturesFor(board, from).filter((move) => {
    const remaining = maxCaptureDepth(boardAfterCapture(board, move), move.to);
    return requiredDepth === undefined ? remaining + 1 === maxCaptureDepth(board, from) : remaining + 1 === requiredDepth;
  });
}

export function legalMoves(s: CheckersState): CheckersMove[] {
  if (s.over) return [];
  if (s.chain !== null) {
    return bestCaptureMovesForPiece(s.board, s.chain, s.chainRemaining ?? maxCaptureDepth(s.board, s.chain) + 1);
  }

  let allCaptures: CheckersMove[] = [];
  let maximum = 0;
  for (let i = 0; i < 64; i++) {
    const piece = s.board[i];
    if (!piece || piece.p !== s.turn) continue;
    const depth = maxCaptureDepth(s.board, i);
    if (depth > maximum) {
      maximum = depth;
      allCaptures = bestCaptureMovesForPiece(s.board, i, depth);
    } else if (depth > 0 && depth === maximum) {
      allCaptures.push(...bestCaptureMovesForPiece(s.board, i, depth));
    }
  }
  if (maximum > 0) return allCaptures;

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
    return legalMoves(state).some((m) =>
      m.from === move.from && m.to === move.to && m.captured === move.captured
    );
  },
  applyMove(state, move) {
    if (!checkersEngine.validateMove(state, move)) return state;
    const n = clone(state);
    const piece = n.board[move.from]!;
    const legalBefore = legalMoves(state);
    const wasCapture = isCapture(move);
    const captureTarget = move.captured;
    n.board[move.from] = null;
    n.board[move.to] = piece;
    if (captureTarget !== undefined) n.board[captureTarget] = null;

    const crownRank = piece.p === 0 ? 0 : 7;
    const crowned = !piece.king && rank(move.to) === crownRank;
    if (crowned) piece.king = true;
    n.lastMove = { ...move };

    if (wasCapture) {
      const remainingRequired = state.chain !== null
        ? Math.max(0, (state.chainRemaining ?? 1) - 1)
        : Math.max(0, (Math.max(...legalBefore.map((m) => maxCaptureDepth(state.board, m.from))) || 1) - 1);
      const further = capturesFor(n.board, move.to);
      if (further.length > 0 && remainingRequired > 0) {
        n.chain = move.to;
        n.chainRemaining = remainingRequired;
      } else {
        n.chain = null;
        n.chainRemaining = undefined;
        n.turn = state.turn === 0 ? 1 : 0;
      }
    } else {
      n.chain = null;
      n.chainRemaining = undefined;
      n.turn = state.turn === 0 ? 1 : 0;
    }

    const currentPlayerPieces = n.board.filter((x) => x && x.p === n.turn).length;
    if (currentPlayerPieces === 0 || legalMoves(n).length === 0) {
      n.over = true;
      n.winner = n.turn === 0 ? 1 : 0;
    }
    return n;
  },
  getState: (s) => s,
  isGameOver: (s) => s.over,
  getWinner: (s) => s.winner,
  legalMoves,
};
