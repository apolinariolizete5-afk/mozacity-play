import type { GameEngine } from "./types";

export interface CheckerPiece {
  /** 0 = player one (light, moves up), 1 = player two (dark, moves down) */
  p: 0 | 1;
  king: boolean;
}

export interface CheckersMove {
  from: number;
  to: number;
}

export interface CheckersState {
  board: (CheckerPiece | null)[];
  turn: 0 | 1;
  /** when a chain capture is in progress, only this square may move */
  chain: number | null;
  over: boolean;
  winner: number | null;
  lastMove: CheckersMove | null;
}

const rank = (i: number) => Math.floor(i / 8);
const file = (i: number) => i % 8;
const idx = (r: number, f: number) => r * 8 + f;
const on = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;

export const isDarkSquare = (i: number) => (rank(i) + file(i)) % 2 === 1;

function clone(s: CheckersState): CheckersState {
  return { ...s, board: s.board.map((p) => (p ? { ...p } : null)) };
}

function movesFor(s: CheckersState, from: number, capturesOnly: boolean): CheckersMove[] {
  const p = s.board[from];
  if (!p) return [];
  const out: CheckersMove[] = [];
  const dirs = p.king ? [-1, 1] : p.p === 0 ? [-1] : [1];
  for (const dr of dirs) {
    for (const df of [-1, 1]) {
      const r = rank(from) + dr;
      const f = file(from) + df;
      if (!on(r, f)) continue;
      const mid = idx(r, f);
      const occ = s.board[mid];
      if (!occ && !capturesOnly) out.push({ from, to: mid });
      if (occ && occ.p !== p.p) {
        const jr = r + dr;
        const jf = f + df;
        if (on(jr, jf) && !s.board[idx(jr, jf)]) out.push({ from, to: idx(jr, jf) });
      }
    }
  }
  return out;
}

const isCapture = (m: CheckersMove) => Math.abs(rank(m.to) - rank(m.from)) === 2;

export function legalMoves(s: CheckersState): CheckersMove[] {
  if (s.over) return [];
  if (s.chain !== null) return movesFor(s, s.chain, true).filter(isCapture);
  const all: CheckersMove[] = [];
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (p && p.p === s.turn) all.push(...movesFor(s, i, false));
  }
  const caps = all.filter(isCapture);
  return caps.length ? caps : all;
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
    return { board, turn: 0, chain: null, over: false, winner: null, lastMove: null };
  },
  validateMove(state, move) {
    return legalMoves(state).some((m) => m.from === move.from && m.to === move.to);
  },
  applyMove(state, move) {
    if (!checkersEngine.validateMove(state, move)) return state;
    const n = clone(state);
    const p = n.board[move.from]!;
    n.board[move.from] = null;
    n.board[move.to] = p;
    const captured = isCapture(move);
    if (captured) {
      const mr = (rank(move.from) + rank(move.to)) / 2;
      const mf = (file(move.from) + file(move.to)) / 2;
      n.board[idx(mr, mf)] = null;
    }
    const crownRank = p.p === 0 ? 0 : 7;
    const crowned = !p.king && rank(move.to) === crownRank;
    if (crowned) p.king = true;
    n.lastMove = move;

    const more = captured && !crowned && movesFor(n, move.to, true).filter(isCapture).length > 0;
    if (more) n.chain = move.to;
    else {
      n.chain = null;
      n.turn = state.turn === 0 ? 1 : 0;
    }

    const opponentPieces = n.board.filter((x) => x && x.p === n.turn).length;
    if (opponentPieces === 0 || legalMoves(n).length === 0) {
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

export function checkersBotMove(s: CheckersState): CheckersMove | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  const caps = moves.filter(isCapture);
  const pool = caps.length ? caps : moves;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
