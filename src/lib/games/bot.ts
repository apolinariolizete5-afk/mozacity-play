import { checkersEngine, legalMoves as checkersMoves, type CheckersMove, type CheckersState } from "./checkers";
import { chessEngine, legalMoves as chessMoves, type ChessMove, type ChessState } from "./chess";
import { ludoEngine, movableTokens, type LudoMove, type LudoState } from "./ludo";
import type { GameId } from "./types";

export type BotDifficulty = "easy" | "normal" | "hard";

export const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "easy", label: "Fácil", description: "Jogadas simples e imprevisíveis." },
  { id: "normal", label: "Normal", description: "Procura capturas e boas posições." },
  { id: "hard", label: "Difícil", description: "Analisa respostas e procura a melhor jogada." },
];

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]!;

function ludoScore(state: LudoState, move: LudoMove): number {
  if (move.type === "roll") return 0;
  const before = state.tokens[state.turn]?.[move.token] ?? -1;
  const dice = state.dice ?? 0;
  let score = dice * 2;
  if (before === -1 && dice === 6) score += 20;
  const target = before === -1 ? 0 : before + dice;
  if (target >= 58) score += 100;
  if (target >= 52) score += 30;
  if (target >= 0 && target < 52) {
    const absolute = (state.turn * 13 + target) % 52;
    if ([0, 8, 13, 21, 26, 34, 39, 47].includes(absolute)) score += 8;
  }
  return score;
}

export function chooseLudoBotMove(state: LudoState, difficulty: BotDifficulty): LudoMove {
  if (state.dice == null) return { type: "roll" };
  const moves = movableTokens(state).map((token) => ({ type: "move", token }) as LudoMove);
  if (!moves.length) return { type: "roll" };
  if (difficulty === "easy") return pick(moves);
  const ranked = moves.map((move) => ({ move, score: ludoScore(state, move) })).sort((a, b) => b.score - a.score);
  if (difficulty === "normal") return ranked[Math.floor(Math.random() * Math.min(2, ranked.length))]!.move;
  return ranked[0]!.move;
}

function checkersScore(state: CheckersState, move: CheckersMove): number {
  const next = checkersEngine.applyMove(state, move);
  let score = 0;
  if (Math.abs(Math.floor(move.to / 8) - Math.floor(move.from / 8)) === 2) score += 100;
  const piece = next.board[move.to];
  if (piece?.king) score += 35;
  if (piece) score += piece.p === 1 ? 3 : -3;
  score += next.board.filter((p) => p?.p === 1).length * 8;
  score -= next.board.filter((p) => p?.p === 0).length * 7;
  if (next.over && next.winner === 1) score += 1000;
  return score;
}

function minimaxCheckers(state: CheckersState, depth: number, maximizing: boolean): number {
  if (depth <= 0 || state.over) {
    return state.board.reduce((sum, p) => sum + (p ? (p.p === 1 ? (p.king ? 18 : 10) : -(p.king ? 18 : 10)) : 0), 0);
  }
  const moves = checkersMoves(state);
  if (!moves.length) return maximizing ? -10000 : 10000;
  const values = moves.map((m) => minimaxCheckers(checkersEngine.applyMove(state, m), depth - 1, !maximizing));
  return maximizing ? Math.max(...values) : Math.min(...values);
}

export function chooseCheckersBotMove(state: CheckersState, difficulty: BotDifficulty): CheckersMove {
  const moves = checkersMoves(state);
  if (!moves.length) return { from: 0, to: 0 };
  if (difficulty === "easy") return pick(moves);
  const depth = difficulty === "hard" ? 3 : 1;
  const ranked = moves.map((move) => {
    const next = checkersEngine.applyMove(state, move);
    const score = checkersScore(state, move) + (difficulty === "hard" ? minimaxCheckers(next, depth - 1, false) : 0);
    return { move, score };
  }).sort((a, b) => b.score - a.score);
  return difficulty === "normal" ? ranked[Math.floor(Math.random() * Math.min(2, ranked.length))]!.move : ranked[0]!.move;
}

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function chessScore(state: ChessState): number {
  let score = 0;
  for (const p of state.board) if (p) score += (p.c === "b" ? 1 : -1) * (VALUE[p.t] ?? 0);
  if (state.over && state.winner === 1) score += 100000;
  if (state.over && state.winner === 0) score -= 100000;
  if (state.draw) score -= 20;
  return score;
}

function minimaxChess(state: ChessState, depth: number, maximizing: boolean): number {
  if (depth <= 0 || state.over) return chessScore(state);
  const moves = chessMoves(state);
  if (!moves.length) return chessScore(state);
  const values = moves.slice(0, 40).map((m) => minimaxChess(chessEngine.applyMove(state, m), depth - 1, !maximizing));
  return maximizing ? Math.max(...values) : Math.min(...values);
}

export function chooseChessBotMove(state: ChessState, difficulty: BotDifficulty): ChessMove {
  const moves = chessMoves(state);
  if (!moves.length) return { from: 0, to: 0 };
  if (difficulty === "easy") return pick(moves);
  const ranked = moves.map((move) => {
    const next = chessEngine.applyMove(state, move);
    const score = chessScore(next);
    const hardBonus = difficulty === "hard" ? minimaxChess(next, 1, false) : 0;
    return { move, score: score + hardBonus };
  }).sort((a, b) => a.score - b.score);
  return difficulty === "normal" ? ranked[Math.floor(Math.random() * Math.min(3, ranked.length))]!.move : ranked[0]!.move;
}

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

export function botLabel(game: GameId, difficulty: BotDifficulty) {
  const name = game === "ludo" ? "Bot Ludo" : game === "checkers" ? "Bot Damas" : "Bot Xadrez";
  return `${name} · ${BOT_DIFFICULTIES.find((item) => item.id === difficulty)?.label ?? "Normal"}`;
}
