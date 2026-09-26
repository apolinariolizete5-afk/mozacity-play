import type { GameEngine } from "./types";

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export interface Piece {
  t: PieceType;
  c: Color;
}

export interface ChessMove {
  from: number;
  to: number;
  promo?: Exclude<PieceType, "p" | "k">;
}

export interface ChessState {
  board: (Piece | null)[];
  turn: Color;
  castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  ep: number | null;
  over: boolean;
  /** 0 = white, 1 = black, null = draw or unfinished */
  winner: number | null;
  draw: boolean;
  lastMove: ChessMove | null;
  history: string[];
}

const rank = (i: number) => Math.floor(i / 8);
const file = (i: number) => i % 8;
const onBoard = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
const idx = (r: number, f: number) => r * 8 + f;

function startBoard(): (Piece | null)[] {
  const b: (Piece | null)[] = Array.from({ length: 64 }, () => null);
  const back: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  back.forEach((t, f) => {
    b[idx(0, f)] = { t, c: "b" };
    b[idx(7, f)] = { t, c: "w" };
  });
  for (let f = 0; f < 8; f++) {
    b[idx(1, f)] = { t: "p", c: "b" };
    b[idx(6, f)] = { t: "p", c: "w" };
  }
  return b;
}

function clone(s: ChessState): ChessState {
  return {
    ...s,
    board: s.board.map((p) => (p ? { ...p } : null)),
    castle: { ...s.castle },
    history: [...s.history],
  };
}

function slide(s: ChessState, from: number, dirs: number[][], out: ChessMove[]) {
  const me = s.board[from]!;
  for (const [dr, df] of dirs) {
    let r = rank(from) + dr!;
    let f = file(from) + df!;
    while (onBoard(r, f)) {
      const to = idx(r, f);
      const occ = s.board[to];
      if (!occ) out.push({ from, to });
      else {
        if (occ.c !== me.c) out.push({ from, to });
        break;
      }
      r += dr!;
      f += df!;
    }
  }
}

const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function pseudoMoves(s: ChessState, color: Color): ChessMove[] {
  const out: ChessMove[] = [];
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || p.c !== color) continue;
    const r = rank(i);
    const f = file(i);
    if (p.t === "p") {
      const dir = color === "w" ? -1 : 1;
      const startRank = color === "w" ? 6 : 1;
      const promoRank = color === "w" ? 0 : 7;
      const one = idx(r + dir, f);
      if (onBoard(r + dir, f) && !s.board[one]) {
        pushPawn(out, i, one, r + dir === promoRank);
        const two = idx(r + 2 * dir, f);
        if (r === startRank && !s.board[two]) out.push({ from: i, to: two });
      }
      for (const df of [-1, 1]) {
        const nr = r + dir;
        const nf = f + df;
        if (!onBoard(nr, nf)) continue;
        const to = idx(nr, nf);
        const occ = s.board[to];
        if ((occ && occ.c !== color) || s.ep === to) pushPawn(out, i, to, nr === promoRank);
      }
    } else if (p.t === "n") {
      for (const [dr, df] of KNIGHT) {
        const nr = r + dr!;
        const nf = f + df!;
        if (!onBoard(nr, nf)) continue;
        const to = idx(nr, nf);
        const occ = s.board[to];
        if (!occ || occ.c !== color) out.push({ from: i, to });
      }
    } else if (p.t === "b") slide(s, i, DIAG, out);
    else if (p.t === "r") slide(s, i, ORTHO, out);
    else if (p.t === "q") slide(s, i, [...DIAG, ...ORTHO], out);
    else if (p.t === "k") {
      for (const [dr, df] of [...DIAG, ...ORTHO]) {
        const nr = r + dr!;
        const nf = f + df!;
        if (!onBoard(nr, nf)) continue;
        const to = idx(nr, nf);
        const occ = s.board[to];
        if (!occ || occ.c !== color) out.push({ from: i, to });
      }
      // castling
      const homeRank = color === "w" ? 7 : 0;
      if (r === homeRank && f === 4 && !inCheck(s, color)) {
        const kSide = color === "w" ? s.castle.wk : s.castle.bk;
        const qSide = color === "w" ? s.castle.wq : s.castle.bq;
        if (kSide && !s.board[idx(homeRank, 5)] && !s.board[idx(homeRank, 6)]) {
          if (!attacked(s, idx(homeRank, 5), color)) out.push({ from: i, to: idx(homeRank, 6) });
        }
        if (
          qSide &&
          !s.board[idx(homeRank, 3)] &&
          !s.board[idx(homeRank, 2)] &&
          !s.board[idx(homeRank, 1)]
        ) {
          if (!attacked(s, idx(homeRank, 3), color)) out.push({ from: i, to: idx(homeRank, 2) });
        }
      }
    }
  }
  return out;
}

function pushPawn(out: ChessMove[], from: number, to: number, promo: boolean) {
  if (promo) (["q", "r", "b", "n"] as const).forEach((p) => out.push({ from, to, promo: p }));
  else out.push({ from, to });
}

function kingSquare(s: ChessState, color: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (p && p.t === "k" && p.c === color) return i;
  }
  return -1;
}

/** Is `square` attacked by the opponent of `color`? */
function attacked(s: ChessState, square: number, color: Color): boolean {
  const enemy: Color = color === "w" ? "b" : "w";
  const naked: ChessState = { ...s, ep: null };
  for (const m of pseudoMovesNoCastle(naked, enemy)) if (m.to === square) return true;
  return false;
}

function pseudoMovesNoCastle(s: ChessState, color: Color): ChessMove[] {
  const out: ChessMove[] = [];
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || p.c !== color) continue;
    const r = rank(i);
    const f = file(i);
    if (p.t === "p") {
      const dir = color === "w" ? -1 : 1;
      for (const df of [-1, 1]) {
        const nr = r + dir;
        const nf = f + df;
        if (onBoard(nr, nf)) out.push({ from: i, to: idx(nr, nf) });
      }
    } else if (p.t === "n") {
      for (const [dr, df] of KNIGHT) {
        const nr = r + dr!;
        const nf = f + df!;
        if (onBoard(nr, nf)) out.push({ from: i, to: idx(nr, nf) });
      }
    } else if (p.t === "k") {
      for (const [dr, df] of [...DIAG, ...ORTHO]) {
        const nr = r + dr!;
        const nf = f + df!;
        if (onBoard(nr, nf)) out.push({ from: i, to: idx(nr, nf) });
      }
    } else if (p.t === "b") slide(s, i, DIAG, out);
    else if (p.t === "r") slide(s, i, ORTHO, out);
    else if (p.t === "q") slide(s, i, [...DIAG, ...ORTHO], out);
  }
  return out;
}

export function inCheck(s: ChessState, color: Color): boolean {
  const k = kingSquare(s, color);
  if (k < 0) return false;
  return attacked(s, k, color);
}

function rawApply(s: ChessState, m: ChessMove): ChessState {
  const n = clone(s);
  const p = n.board[m.from]!;
  const isPawn = p.t === "p";
  const capturedEp = isPawn && n.ep === m.to && !n.board[m.to];
  n.board[m.to] = m.promo ? { t: m.promo, c: p.c } : p;
  n.board[m.from] = null;
  if (capturedEp) {
    const dir = p.c === "w" ? 1 : -1;
    n.board[idx(rank(m.to) + dir, file(m.to))] = null;
  }
  // castling rook shift
  if (p.t === "k" && Math.abs(file(m.to) - file(m.from)) === 2) {
    const r = rank(m.from);
    if (file(m.to) === 6) {
      n.board[idx(r, 5)] = n.board[idx(r, 7)] ?? null;
      n.board[idx(r, 7)] = null;
    } else {
      n.board[idx(r, 3)] = n.board[idx(r, 0)] ?? null;
      n.board[idx(r, 0)] = null;
    }
  }
  // rights
  if (p.t === "k") {
    if (p.c === "w") {
      n.castle.wk = false;
      n.castle.wq = false;
    } else {
      n.castle.bk = false;
      n.castle.bq = false;
    }
  }
  const touch = (i: number) => {
    if (i === 63) n.castle.wk = false;
    if (i === 56) n.castle.wq = false;
    if (i === 7) n.castle.bk = false;
    if (i === 0) n.castle.bq = false;
  };
  touch(m.from);
  touch(m.to);
  n.ep = isPawn && Math.abs(rank(m.to) - rank(m.from)) === 2 ? idx((rank(m.to) + rank(m.from)) / 2, file(m.from)) : null;
  n.turn = s.turn === "w" ? "b" : "w";
  n.lastMove = m;
  return n;
}

export function legalMoves(s: ChessState): ChessMove[] {
  if (s.over) return [];
  return pseudoMoves(s, s.turn).filter((m) => {
    const n = rawApply(s, m);
    return !inCheck(n, s.turn);
  });
}

export const chessEngine: GameEngine<ChessState, ChessMove> = {
  id: "chess",
  name: "Xadrez",
  minPlayers: 2,
  maxPlayers: 2,
  createGame() {
    return {
      board: startBoard(),
      turn: "w",
      castle: { wk: true, wq: true, bk: true, bq: true },
      ep: null,
      over: false,
      winner: null,
      draw: false,
      lastMove: null,
      history: [],
    };
  },
  validateMove(state, move) {
    return legalMoves(state).some(
      (m) => m.from === move.from && m.to === move.to && (m.promo ?? "q") === (move.promo ?? "q"),
    );
  },
  applyMove(state, move) {
    if (!chessEngine.validateMove(state, move)) return state;
    const n = rawApply(state, move);
    n.history.push(`${move.from}-${move.to}`);
    const next = legalMoves(n);
    if (next.length === 0) {
      n.over = true;
      if (inCheck(n, n.turn)) n.winner = n.turn === "w" ? 1 : 0;
      else {
        n.draw = true;
        n.winner = null;
      }
    }
    return n;
  },
  getState: (s) => s,
  isGameOver: (s) => s.over,
  getWinner: (s) => s.winner,
  legalMoves,
};

export const PIECE_GLYPH: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};
