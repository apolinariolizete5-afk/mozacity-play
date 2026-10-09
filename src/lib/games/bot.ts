import { checkersEngine, legalMoves as checkersMoves, type CheckersMove, type CheckersState } from "./checkers";
import { chessEngine, legalMoves as chessMoves, inCheck, type ChessMove, type ChessState } from "./chess";
import { ludoEngine, movableTokens, absoluteRing, SAFE_STEPS, FINISHED, type LudoMove, type LudoState } from "./ludo";
import type { GameId } from "./types";

export type BotDifficulty = "easy" | "normal" | "hard";

export const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "easy", label: "Fácil", description: "Joga de forma simples e comete erros." },
  { id: "normal", label: "Normal", description: "Escolhe jogadas razoáveis e aproveita oportunidades claras." },
  { id: "hard", label: "Difícil", description: "Analisa respostas, protege peças e procura a melhor jogada." },
];

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]!;

/* ------------------------------ LUDO ------------------------------ */

function ludoScore(state: LudoState, move: LudoMove): number {
  if (move.type === "roll") return 0;
  const player = state.turn;
  const before = state.tokens[player]?.[move.token] ?? -1;
  const dice = state.dice ?? 0;
  const target = before === -1 ? 0 : before + dice;
  let score = 0;

  // Getting a new token onto the board and finishing a token are valuable,
  // but the bot should still compare these choices with captures and safety.
  if (before === -1 && dice === 6) score += 34;
  if (target >= FINISHED) score += 240;
  else if (target >= 52) score += 55;
  else if (before >= 0) score += Math.max(0, target - before) * 1.4;

  if (target >= 0 && target < 52) {
    const absolute = absoluteRing(player, target);
    if (SAFE_STEPS.has(absolute)) score += 18;

    for (let opponent = 0; opponent < state.players; opponent += 1) {
      if (opponent === player || state.eliminated.includes(opponent)) continue;
      for (const position of state.tokens[opponent] ?? []) {
        if (position < 0 || position >= 52) continue;
        const enemyAbsolute = absoluteRing(opponent, position);
        if (enemyAbsolute === absolute && !SAFE_STEPS.has(absolute)) score += 115;
        // Estimate immediate vulnerability to an opponent's next die roll.
        const distance = (absolute - enemyAbsolute + 52) % 52;
        if (distance >= 1 && distance <= 6 && !SAFE_STEPS.has(absolute)) score -= 8 + (7 - distance) * 2;
      }
    }
  }

  // Prefer developing the furthest-behind token instead of over-focusing
  // on a single token, unless a capture or finish is available.
  if (before >= 0 && before < 52) {
    const furthest = Math.max(...(state.tokens[player] ?? []).filter((p) => p >= 0 && p < 52), -1);
    if (before < furthest) score += 8;
  }
  if (state.tokens[player]?.every((p) => p === FINISHED || p === -1)) score += 2;
  return score;
}

export function chooseLudoBotMove(state: LudoState, difficulty: BotDifficulty): LudoMove {
  if (state.dice == null) return { type: "roll" };
  const moves = movableTokens(state).map((token) => ({ type: "move", token }) as LudoMove);
  if (!moves.length) return { type: "roll" };
  if (difficulty === "easy") return pick(moves);

  const ranked = moves
    .map((move) => ({ move, score: ludoScore(state, move) }))
    .sort((a, b) => b.score - a.score);

  if (difficulty === "normal") {
    // Normal usually makes a good move, but sometimes misses the best one.
    const pool = ranked.slice(0, Math.min(3, ranked.length));
    return pick(pool).move;
  }

  // Hard evaluates each candidate's result, then slightly penalizes moves
  // that leave the token exposed. The die remains random and fair.
  return ranked[0]!.move;
}

/* ------------------------------ DAMAS ------------------------------ */

function checkersEval(state: CheckersState): number {
  if (state.over) return state.winner === 1 ? 100000 : state.winner === 0 ? -100000 : 0;
  let score = 0;
  let botPieces = 0;
  let humanPieces = 0;
  for (let i = 0; i < state.board.length; i += 1) {
    const piece = state.board[i];
    if (!piece) continue;
    const row = Math.floor(i / 8);
    const col = i % 8;
    const material = piece.king ? 185 : 100;
    const progress = piece.p === 1 ? row * 2 : (7 - row) * 2;
    const center = 3.5 - Math.abs(3.5 - col) + 3.5 - Math.abs(3.5 - row);
    const value = material + progress + center * (piece.king ? 2.5 : 1.2);
    if (piece.p === 1) {
      botPieces += 1;
      score += value;
    } else {
      humanPieces += 1;
      score -= value;
    }
  }
  if (botPieces === 0) return -100000;
  if (humanPieces === 0) return 100000;

  // Mobility helps distinguish a safe position from pieces that are trapped.
  const currentTurn = state.turn;
  const ownMoves = checkersMoves(state).length;
  const otherState = { ...state, turn: state.turn === 1 ? 0 as const : 1 as const };
  const otherMoves = checkersMoves(otherState).length;
  score += (currentTurn === 1 ? ownMoves - otherMoves : otherMoves - ownMoves) * 2;
  return score;
}

function orderCheckersMoves(state: CheckersState, moves: CheckersMove[]): CheckersMove[] {
  return [...moves].sort((a, b) => {
    const captureA = a.capturedPieces?.length ?? (a.captured === undefined ? 0 : 1);
    const captureB = b.capturedPieces?.length ?? (b.captured === undefined ? 0 : 1);
    const crownA = state.board[a.from] && !state.board[a.from]!.king && (state.board[a.from]!.p === 0 ? Math.floor(a.to / 8) === 0 : Math.floor(a.to / 8) === 7) ? 1 : 0;
    const crownB = state.board[b.from] && !state.board[b.from]!.king && (state.board[b.from]!.p === 0 ? Math.floor(b.to / 8) === 0 : Math.floor(b.to / 8) === 7) ? 1 : 0;
    return captureB - captureA || crownB - crownA;
  });
}

function minimaxCheckers(state: CheckersState, depth: number, alpha: number, beta: number): number {
  if (depth <= 0 || state.over) return checkersEval(state);
  const moves = orderCheckersMoves(state, checkersMoves(state));
  if (!moves.length) return state.turn === 1 ? -100000 : 100000;

  if (state.turn === 1) {
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(best, minimaxCheckers(checkersEngine.applyMove(state, move), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    best = Math.min(best, minimaxCheckers(checkersEngine.applyMove(state, move), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseCheckersBotMove(state: CheckersState, difficulty: BotDifficulty): CheckersMove {
  const moves = checkersMoves(state);
  if (!moves.length) return { from: 0, to: 0 };
  if (difficulty === "easy") return pick(moves);

  const ordered = orderCheckersMoves(state, moves);
  if (difficulty === "normal") {
    // Normal notices captures and crowns, but retains some human-like variety.
    const ranked = ordered.map((move) => ({ move, score: checkersEval(checkersEngine.applyMove(state, move)) }))
      .sort((a, b) => b.score - a.score);
    return pick(ranked.slice(0, Math.min(3, ranked.length))).move;
  }

  let bestScore = -Infinity;
  let bestMoves: CheckersMove[] = [];
  let alpha = -Infinity;
  for (const move of ordered) {
    const next = checkersEngine.applyMove(state, move);
    const score = minimaxCheckers(next, 4, alpha, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
    alpha = Math.max(alpha, bestScore);
  }
  return pick(bestMoves.length ? bestMoves : ordered);
}

/* ------------------------------ XADREZ ------------------------------ */

const VALUE: Record<string, number> = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };

function chessEval(state: ChessState, perspective: "w" | "b"): number {
  if (state.over) {
    if (state.winner === (perspective === "w" ? 0 : 1)) return 100000;
    if (state.winner !== null) return -100000;
    return 0;
  }
  let score = 0;
  for (let i = 0; i < state.board.length; i += 1) {
    const p = state.board[i];
    if (!p) continue;
    const sign = p.c === perspective ? 1 : -1;
    const row = Math.floor(i / 8);
    const col = i % 8;
    const center = 3.5 - Math.abs(3.5 - col) + 3.5 - Math.abs(3.5 - row);
    let positional = 0;
    if (p.t === "p") positional = (p.c === "w" ? 6 - row : row - 1) * 5 + center * 1.2;
    else if (p.t === "n" || p.t === "b") positional = center * 5;
    else if (p.t === "q") positional = center * 1.5;
    else if (p.t === "k") positional = center * -2;
    score += sign * ((VALUE[p.t] ?? 0) + positional);
  }
  if (inCheck(state, perspective)) score -= 28;
  if (inCheck(state, perspective === "w" ? "b" : "w")) score += 28;
  return score;
}

function orderChessMoves(state: ChessState, moves: ChessMove[]): ChessMove[] {
  return [...moves].sort((a, b) => {
    const score = (m: ChessMove) => {
      const victim = state.board[m.to];
      const attacker = state.board[m.from];
      return (victim ? (VALUE[victim.t] ?? 0) * 10 - (VALUE[attacker?.t ?? "p"] ?? 0) : 0)
        + (m.promo ? (VALUE[m.promo] ?? 0) : 0);
    };
    return score(b) - score(a);
  });
}

function minimaxChess(state: ChessState, depth: number, perspective: "w" | "b", alpha: number, beta: number): number {
  if (depth <= 0 || state.over) return chessEval(state, perspective);
  const moves = orderChessMoves(state, chessMoves(state));
  if (!moves.length) return chessEval(state, perspective);
  const maximizing = state.turn === perspective;
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(best, minimaxChess(chessEngine.applyMove(state, move), depth - 1, perspective, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    best = Math.min(best, minimaxChess(chessEngine.applyMove(state, move), depth - 1, perspective, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseChessBotMove(state: ChessState, difficulty: BotDifficulty): ChessMove {
  const moves = chessMoves(state);
  if (!moves.length) return { from: 0, to: 0 };
  if (difficulty === "easy") return pick(moves);

  const perspective = state.turn;
  const ordered = orderChessMoves(state, moves);
  if (difficulty === "normal") {
    const ranked = ordered.map((move) => ({
      move,
      score: chessEval(chessEngine.applyMove(state, move), perspective),
    })).sort((a, b) => b.score - a.score);
    return pick(ranked.slice(0, Math.min(4, ranked.length))).move;
  }

  let bestScore = -Infinity;
  let bestMoves: ChessMove[] = [];
  let alpha = -Infinity;
  for (const move of ordered) {
    const next = chessEngine.applyMove(state, move);
    const score = minimaxChess(next, 3, perspective, alpha, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
    alpha = Math.max(alpha, bestScore);
  }
  return pick(bestMoves.length ? bestMoves : ordered);
}

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

export function botLabel(game: GameId, difficulty: BotDifficulty) {
  const name = game === "ludo" ? "Bot Ludo" : game === "checkers" ? "Bot Damas" : "Bot Xadrez";
  return `${name} · ${BOT_DIFFICULTIES.find((item) => item.id === difficulty)?.label ?? "Normal"}`;
}
