import type { GameEngine } from "./types";

export const RING = 52;
export const HOME_COLUMN = 6;
/** token position: -1 = base, 0..51 ring (own-relative), 52..57 home column, 58 = finished */
export const FINISHED = RING + HOME_COLUMN;

export type LudoMove = { type: "roll"; value?: number } | { type: "move"; token: number };

export interface LudoState {
  players: number;
  tokens: number[][];
  turn: number;
  dice: number | null;
  sixStreak: number;
  over: boolean;
  winner: number | null;
  log: string[];
}

/** Base ring path for player 0 on a 15x15 grid, rotated for the other seats. */
const BASE_PATH: [number, number][] = [
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0],
];

const BASE_HOME: [number, number][] = [
  [7, 1],
  [7, 2],
  [7, 3],
  [7, 4],
  [7, 5],
  [7, 6],
];

const rot = ([r, c]: [number, number], times: number): [number, number] => {
  let p: [number, number] = [r, c];
  for (let i = 0; i < times; i++) p = [p[1], 14 - p[0]];
  return p;
};

export function ringCell(player: number, step: number): [number, number] {
  const absolute = (player * 13 + step) % RING;
  return rot(BASE_PATH[absolute]!, player);
}

export function cellFor(player: number, pos: number): [number, number] | null {
  if (pos < 0) return null;
  if (pos < RING) return ringCell(player, pos);
  if (pos < FINISHED) return rot(BASE_HOME[pos - RING]!, player);
  return [7, 7];
}

/** Shared ring index so collisions across players can be compared. */
export const absoluteRing = (player: number, pos: number) =>
  pos >= 0 && pos < RING ? (player * 13 + pos) % RING : -1;

export const SAFE_STEPS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function clone(s: LudoState): LudoState {
  return { ...s, tokens: s.tokens.map((t) => [...t]), log: [...s.log] };
}

export function movableTokens(s: LudoState): number[] {
  if (s.dice == null || s.over) return [];
  const mine = s.tokens[s.turn]!;
  const out: number[] = [];
  mine.forEach((pos, i) => {
    if (pos === FINISHED) return;
    if (pos === -1) {
      if (s.dice === 6) out.push(i);
      return;
    }
    if (pos + (s.dice ?? 0) <= FINISHED) out.push(i);
  });
  return out;
}

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
      over: false,
      winner: null,
      log: [],
    };
  },
  validateMove(state, move) {
    if (state.over) return false;
    if (move.type === "roll") return state.dice == null;
    return movableTokens(state).includes(move.token);
  },
  applyMove(state, move) {
    if (!ludoEngine.validateMove(state, move)) return state;
    const n = clone(state);
    if (move.type === "roll") {
      const value = move.value ?? 1 + Math.floor(Math.random() * 6);
      n.dice = value;
      n.log.unshift(`Jogador ${n.turn + 1} lançou ${value}`);
      if (movableTokens(n).length === 0) {
        n.dice = null;
        n.sixStreak = 0;
        n.turn = (n.turn + 1) % n.players;
        n.log.unshift("Sem jogadas possíveis — passa a vez");
      }
      return n;
    }

    const dice = n.dice!;
    const mine = n.tokens[n.turn]!;
    const from = mine[move.token]!;
    let captured = false;
    if (from === -1) mine[move.token] = 0;
    else {
      const target = from + dice;
      mine[move.token] = target;
      const abs = absoluteRing(n.turn, target);
      if (abs >= 0 && !SAFE_STEPS.has(target)) {
        for (let p = 0; p < n.players; p++) {
          if (p === n.turn) continue;
          n.tokens[p] = n.tokens[p]!.map((pos) => {
            if (absoluteRing(p, pos) === abs) {
              captured = true;
              return -1;
            }
            return pos;
          });
        }
      }
    }
    if (captured) n.log.unshift(`Jogador ${n.turn + 1} capturou uma peça!`);

    if (mine.every((p) => p === FINISHED)) {
      n.over = true;
      n.winner = n.turn;
      n.dice = null;
      n.log.unshift(`Jogador ${n.turn + 1} venceu!`);
      return n;
    }

    const extra = dice === 6 || captured;
    n.dice = null;
    if (extra && n.sixStreak < 2) n.sixStreak += 1;
    else {
      n.sixStreak = 0;
      n.turn = (n.turn + 1) % n.players;
    }
    return n;
  },
  getState: (s) => s,
  isGameOver: (s) => s.over,
  getWinner: (s) => s.winner,
  legalMoves(state) {
    if (state.dice == null) return [{ type: "roll" } as LudoMove];
    return movableTokens(state).map((token) => ({ type: "move", token }) as LudoMove);
  },
};

export function ludoBotMove(s: LudoState): LudoMove | null {
  if (s.over) return null;
  if (s.dice == null) return { type: "roll" };
  const options = movableTokens(s);
  if (!options.length) return null;
  const mine = s.tokens[s.turn]!;
  // prefer finishing, then leaving base, then the furthest token
  const finishing = options.find((t) => mine[t]! + s.dice! === FINISHED);
  if (finishing !== undefined) return { type: "move", token: finishing };
  const leaving = options.find((t) => mine[t] === -1);
  if (leaving !== undefined && s.dice === 6) return { type: "move", token: leaving };
  const best = options.reduce((a, b) => (mine[a]! >= mine[b]! ? a : b));
  return { type: "move", token: best };
}

export const LUDO_COLORS = ["#f97316", "#22d3ee", "#a3e635", "#f472b6"];
export const LUDO_NAMES = ["Laranja", "Ciano", "Lima", "Rosa"];
