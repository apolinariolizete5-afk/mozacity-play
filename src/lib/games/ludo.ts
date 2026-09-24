import type { GameEngine } from "./types";

export const RING = 52;
export const HOME_COLUMN = 6;
/** token position: -1 = base, 0..51 ring (own-relative), 52..57 home column, 58 = finished */
export const FINISHED = RING + HOME_COLUMN;

export type LudoMove = { type: "roll"; value?: number } | { type: "move"; token: number };

export interface LudoState {
  players: number;
  tokens: number[][]; // tokens[player][tokenIndex] = position
  turn: number;
  dice: number | null;
  sixStreak: number;
  bonusRoll: boolean;
  over: boolean;
  winner: number | null;
  log: string[];
}

/** Base ring path for player 0 on a 15x15 grid, rotated for the other seats. */
const BASE_PATH: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const BASE_HOME: [number, number][] = [
  [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6],
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
  return [7, 7]; // Center victory goal
}

/** Shared ring index (0..51) so collisions across players can be compared. */
export const absoluteRing = (player: number, pos: number) =>
  pos >= 0 && pos < RING ? (player * 13 + pos) % RING : -1;

/** Safe squares: 4 starting squares + 4 star squares (immune to capture) */
export const SAFE_STEPS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function isSafeCell(player: number, pos: number): boolean {
  if (pos < 0 || pos >= RING) return true; // Base or home column/center is safe
  const abs = absoluteRing(player, pos);
  return SAFE_STEPS.has(abs);
}

function clone(s: LudoState): LudoState {
  return { ...s, tokens: s.tokens.map((t) => [...t]), log: [...s.log] };
}

export function movableTokens(s: LudoState): number[] {
  if (s.dice == null || s.over) return [];
  const mine = s.tokens[s.turn]!;
  const out: number[] = [];
  mine.forEach((pos, i) => {
    if (pos === FINISHED) return; // already in center
    if (pos === -1) {
      if (s.dice === 6) out.push(i);
      return;
    }
    // Must land exactly on FINISHED or within the home stretch
    if (pos + s.dice <= FINISHED) {
      out.push(i);
    }
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
      bonusRoll: false,
      over: false,
      winner: null,
      log: ["Jogo iniciado. Boa sorte!"],
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
      const isSix = value === 6;

      if (isSix) {
        n.sixStreak += 1;
      } else {
        n.sixStreak = 0;
      }

      // Three consecutive 6s penalty: turn is revoked and passed
      if (n.sixStreak === 3) {
        n.log.unshift(`${LUDO_NAMES[n.turn]} tirou 3 seis consecutivos! Perde a vez.`);
        n.dice = null;
        n.sixStreak = 0;
        n.bonusRoll = false;
        n.turn = (n.turn + 1) % n.players;
        return n;
      }

      n.log.unshift(`${LUDO_NAMES[n.turn]} lançou o dado: ${value}${isSix ? " (jogada extra!)" : ""}`);

      const valid = movableTokens(n);
      if (valid.length === 0) {
        n.log.unshift(`Nenhuma peça válida para mover com ${value}. Passa a vez.`);
        n.dice = null;
        n.sixStreak = 0;
        n.bonusRoll = false;
        n.turn = (n.turn + 1) % n.players;
      }
      return n;
    }

    // Move token
    const dice = n.dice!;
    const mine = n.tokens[n.turn]!;
    const from = mine[move.token]!;
    let captured = false;
    let reachedCenter = false;

    if (from === -1) {
      // Exit base to step 0
      mine[move.token] = 0;
      n.log.unshift(`${LUDO_NAMES[n.turn]} tirou um peão da base!`);
    } else {
      const target = from + dice;
      mine[move.token] = target;

      if (target === FINISHED) {
        reachedCenter = true;
        n.log.unshift(`🎉 ${LUDO_NAMES[n.turn]} levou um peão ao centro!`);
      } else {
        // Check capture on ring
        const abs = absoluteRing(n.turn, target);
        if (abs >= 0 && !SAFE_STEPS.has(abs)) {
          // Check collision with opponent tokens
          for (let p = 0; p < n.players; p++) {
            if (p === n.turn) continue;
            n.tokens[p]!.forEach((opos, oi) => {
              if (opos >= 0 && opos < RING && absoluteRing(p, opos) === abs) {
                // Captured!
                n.tokens[p]![oi] = -1;
                captured = true;
                n.log.unshift(`💥 ${LUDO_NAMES[n.turn]} comeu o peão de ${LUDO_NAMES[p]}! Bónus de jogada extra!`);
              }
            });
          }
        }
      }
    }

    // Check winner: all 4 tokens finished
    if (mine.every((pos) => pos === FINISHED)) {
      n.over = true;
      n.winner = n.turn;
      n.dice = null;
      n.log.unshift(`🏆 ${LUDO_NAMES[n.turn]} venceu a partida! Parabéns!`);
      return n;
    }

    // Extra roll if rolled 6, captured opponent, or reached center
    const getsExtraRoll = dice === 6 || captured || reachedCenter;

    n.dice = null;
    if (getsExtraRoll) {
      n.bonusRoll = true;
      // Stays on same turn
    } else {
      n.sixStreak = 0;
      n.bonusRoll = false;
      n.turn = (n.turn + 1) % n.players;
    }

    return n;
  },
  legalMoves(state) {
    if (state.over) return [];
    if (state.dice == null) return [{ type: "roll" } as LudoMove];
    return movableTokens(state).map((token) => ({ type: "move", token }) as LudoMove);
  },
};

export function ludoBotMove(s: LudoState): LudoMove | null {
  if (s.over) return null;
  if (s.dice == null) return { type: "roll" };
  const tokens = movableTokens(s);
  if (!tokens.length) return null;

  // AI Strategy priority:
  // 1. Capture opponent token
  // 2. Reach center
  // 3. Exit base on 6
  // 4. Move token safest / furthest
  for (const t of tokens) {
    const pos = s.tokens[s.turn]![t]!;
    if (pos >= 0 && pos + s.dice! < RING) {
      const abs = absoluteRing(s.turn, pos + s.dice!);
      if (abs >= 0 && !SAFE_STEPS.has(abs)) {
        for (let p = 0; p < s.players; p++) {
          if (p === s.turn) continue;
          if (s.tokens[p]!.some((op) => op >= 0 && op < RING && absoluteRing(p, op) === abs)) {
            return { type: "move", token: t };
          }
        }
      }
    }
  }

  // Check if any move reaches center
  for (const t of tokens) {
    if (s.tokens[s.turn]![t]! + s.dice! === FINISHED) {
      return { type: "move", token: t };
    }
  }

  // Check exit base
  const outBase = tokens.find((t) => s.tokens[s.turn]![t] === -1);
  if (outBase !== undefined && s.dice === 6) {
    return { type: "move", token: outBase };
  }

  // Otherwise pick highest progressive token
  tokens.sort((a, b) => (s.tokens[s.turn]![b] ?? -1) - (s.tokens[s.turn]![a] ?? -1));
  return { type: "move", token: tokens[0]! };
}

// 4 Official classic colors: Green (0), Yellow (1), Blue (2), Red (3)
export const LUDO_COLORS = ["#16a34a", "#eab308", "#2563eb", "#dc2626"];
export const LUDO_BG_COLORS = ["#dcfce7", "#fef9c3", "#dbeafe", "#fee2e2"];
export const LUDO_NAMES = ["Verde", "Amarelo", "Azul", "
