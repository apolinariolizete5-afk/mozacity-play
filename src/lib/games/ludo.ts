import type { GameEngine } from "./types";

export const RING = 52;
export const HOME_COLUMN = 6;
export const FINISHED = RING + HOME_COLUMN;

export type LudoMove = { type: "roll"; value?: number } | { type: "move"; token: number };

export interface LudoState {
  players: number;
  tokens: number[][];
  turn: number;
  dice: number | null;
  sixStreak: number;
  bonusRoll: boolean;
  over: boolean;
  winner: number | null;
  log: string[];
}

/** Clockwise ring coordinates on the 15 × 15 board, starting at green. */
const RING_PATH: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];

const GREEN_HOME: [number, number][] = [
  [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6],
];

const rotate = ([row, col]: [number, number], times: number): [number, number] => {
  let point: [number, number] = [row, col];
  for (let index = 0; index < times; index += 1) point = [point[1], 14 - point[0]];
  return point;
};

export function ringCell(player: number, step: number): [number, number] {
  return RING_PATH[(player * 13 + step) % RING] ?? [7, 7];
}

export function cellFor(player: number, position: number): [number, number] | null {
  if (position < 0) return null;
  if (position < RING) return ringCell(player, position);
  if (position < FINISHED) return rotate(GREEN_HOME[position - RING] ?? [7, 7], player);
  return [7, 7];
}

export const absoluteRing = (player: number, position: number) =>
  position >= 0 && position < RING ? (player * 13 + position) % RING : -1;

/** Four coloured starts and four starred squares are immune to capture. */
export const SAFE_STEPS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function isSafeCell(player: number, position: number): boolean {
  if (position < 0 || position >= RING) return true;
  return SAFE_STEPS.has(absoluteRing(player, position));
}

function clone(state: LudoState): LudoState {
  return { ...state, tokens: state.tokens.map((tokens) => [...tokens]), log: [...state.log] };
}

export function movableTokens(state: LudoState): number[] {
  if (state.dice == null || state.over) return [];
  const dice = state.dice;
  const mine = state.tokens[state.turn];
  if (!mine) return [];
  return mine.flatMap((position, token) => {
    if (position === FINISHED) return [];
    if (position === -1) return state.dice === 6 ? [token] : [];
    return position + dice <= FINISHED ? [token] : [];
  });
}

export function ludoTimeout(state: LudoState): LudoState {
  if (state.over) return state;
  const next = clone(state);
  next.dice = null;
  next.sixStreak = 0;
  next.bonusRoll = false;
  next.turn = (next.turn + 1) % next.players;
  next.log.unshift("Tempo esgotado. A vez passou ao próximo jogador.");
  return next;
}

export const LUDO_NAMES = ["Verde", "Amarelo", "Azul", "Vermelho"] as const;

export const ludoEngine: GameEngine<LudoState, LudoMove> = {
  id: "ludo",
  name: "Ludo",
  minPlayers: 2,
  maxPlayers: 4,
  createGame(options) {
    const players = Math.min(4, Math.max(2, options?.players ?? 4));
    return {
      players,
      tokens: Array.from({ length: players }, () => [-1, -1, -1, -1]),
      turn: 0,
      dice: null,
      sixStreak: 0,
      bonusRoll: false,
      over: false,
      winner: null,
      log: ["Jogo iniciado. Boa sorte!"],
    };
  },
  validateMove(state, move) {
    if (state.over) return false;
    return move.type === "roll" ? state.dice == null : movableTokens(state).includes(move.token);
  },
  applyMove(state, move) {
    if (!ludoEngine.validateMove(state, move)) return state;
    const next = clone(state);
    const playerName = LUDO_NAMES[next.turn] ?? "Jogador";

    if (move.type === "roll") {
      const value = move.value ?? 1 + Math.floor(Math.random() * 6);
      next.dice = value;
      next.sixStreak = value === 6 ? next.sixStreak + 1 : 0;

      if (next.sixStreak === 3) {
        next.log.unshift(`${playerName} tirou três seis consecutivos e perdeu a vez.`);
        next.dice = null;
        next.sixStreak = 0;
        next.bonusRoll = false;
        next.turn = (next.turn + 1) % next.players;
        return next;
      }

      next.log.unshift(`${playerName} lançou o dado: ${value}${value === 6 ? " — jogada extra!" : ""}`);
      if (movableTokens(next).length === 0) {
        next.log.unshift(`Nenhuma peça pode avançar ${value} casas.`);
        next.dice = null;
        next.sixStreak = 0;
        next.bonusRoll = false;
        next.turn = (next.turn + 1) % next.players;
      }
      return next;
    }

    const dice = next.dice;
    const mine = next.tokens[next.turn];
    if (dice == null || !mine) return state;
    const from = mine[move.token];
    if (from == null) return state;
    let captured = false;
    let reachedCenter = false;

    if (from === -1) {
      mine[move.token] = 0;
      next.log.unshift(`${playerName} tirou um peão da base.`);
    } else {
      const target = from + dice;
      mine[move.token] = target;
      if (target === FINISHED) {
        reachedCenter = true;
        next.log.unshift(`${playerName} levou um peão ao centro!`);
      } else {
        const destination = absoluteRing(next.turn, target);
        if (destination >= 0 && !SAFE_STEPS.has(destination)) {
          next.tokens.forEach((tokens, player) => {
            if (player === next.turn) return;
            tokens.forEach((position, token) => {
              if (position >= 0 && position < RING && absoluteRing(player, position) === destination) {
                tokens[token] = -1;
                captured = true;
                next.log.unshift(`${playerName} comeu o peão de ${LUDO_NAMES[player] ?? "um adversário"}!`);
              }
            });
          });
        }
      }
    }

    if (mine.every((position) => position === FINISHED)) {
      next.over = true;
      next.winner = next.turn;
      next.dice = null;
      next.log.unshift(`${playerName} venceu a partida!`);
      return next;
    }

    next.dice = null;
    if (dice === 6 || captured || reachedCenter) {
      next.bonusRoll = true;
    } else {
      next.sixStreak = 0;
      next.bonusRoll = false;
      next.turn = (next.turn + 1) % next.players;
    }
    return next;
  },
  legalMoves(state) {
    if (state.over) return [];
    if (state.dice == null) return [{ type: "roll" } as LudoMove];
    return movableTokens(state).map((token) => ({ type: "move", token }) as LudoMove);
  },
  getState(state) {
    return state;
  },
  isGameOver(state) {
    return state.over;
  },
  getWinner(state) {
    return state.winner;
  },
};
