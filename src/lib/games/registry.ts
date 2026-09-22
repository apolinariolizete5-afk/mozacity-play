import { chessEngine } from "./chess";
import { checkersEngine } from "./checkers";
import { ludoEngine } from "./ludo";
import type { GameEngine, GameId } from "./types";

/** Motores indexados por id — usado no cliente e no servidor (validação autoritativa). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ENGINES: Record<GameId, GameEngine<any, any>> = {
  chess: chessEngine,
  checkers: checkersEngine,
  ludo: ludoEngine,
};

export const CAPACITY: Record<GameId, number[]> = {
  chess: [2],
  checkers: [2],
  ludo: [2, 3, 4],
};

export const isGameId = (v: unknown): v is GameId =>
  v === "chess" || v === "checkers" || v === "ludo";
