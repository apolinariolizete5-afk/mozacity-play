export type GameId = "ludo" | "checkers" | "chess";

export interface GameEngine<S, M> {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  createGame(options?: { players?: number }): S;
  validateMove(state: S, move: M): boolean;
  applyMove(state: S, move: M): S;
  getState(state: S): S;
  isGameOver(state: S): boolean;
  getWinner(state: S): number | null;
  legalMoves(state: S): M[];
}

export const GAME_META: Record<GameId, { name: string; tagline: string; players: string; cover: string }> = {
  ludo: { name: "Ludo", tagline: "Corrida de dados", players: "2-4 jogadores", cover: "/covers/ludo.svg" },
  checkers: { name: "Damas", tagline: "Capturas obrigatórias", players: "2 jogadores", cover: "/covers/checkers.svg" },
  chess: { name: "Xadrez", tagline: "Regras completas", players: "2 jogadores", cover: "/covers/chess.svg" },
};
