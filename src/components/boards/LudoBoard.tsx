import boardAsset from "@/assets/ludo/board.png.asset.json";
import { FINISHED, cellFor, movableTokens, type LudoState } from "@/lib/games/ludo";
import { cn } from "@/lib/utils";

const BASE_POINTS: [number, number][][] = [
  [[2, 2], [2, 4], [4, 2], [4, 4]],         // Jogador 0: Verde
  [[2, 10], [2, 12], [4, 10], [4, 12]],     // Jogador 1: Amarelo
  [[10, 10], [10, 12], [12, 10], [12, 12]], // Jogador 2: Azul
  [[10, 2], [10, 4], [12, 2], [12, 4]],     // Jogador 3: Vermelho
];

const PAWN_COLOR_CLASSES = [
  "ludo-pawn-green",
  "ludo-pawn-yellow",
  "ludo-pawn-blue",
  "ludo-pawn-red",
];

const FINISH_OFFSETS: [number, number][] = [
  [-0.2, -0.2],
  [-0.2, 0.2],
  [0.2, 0.2],
  [0.2, -0.2],
];

interface PawnView {
  player: number;
  token: number;
  row: number;
  col: number;
  movable: boolean;
}

export function LudoBoard({
  state,
  disabled,
  onMove,
}: {
  state: LudoState;
  disabled?: boolean;
  onMove: (token: number) => void;
}) {
  const legal = new Set(movableTokens(state));
  const occupied = new Map<string, number>();
  const pawns: PawnView[] = [];

  state.tokens.forEach((playerTokens, player) => {
    playerTokens.forEach((position, token) => {
      let point: [number, number] | undefined;
      if (position === -1) {
        point = BASE_POINTS[player]?.[token];
      } else {
        const cell = cellFor(player, position);
        if (cell) point = cell;
      }
      if (!point) return;

      let [row, col] = point;
      if (position === FINISHED) {
        const offset = FINISH_OFFSETS[player] ?? [0, 0];
        row += offset[0] + (token % 2) * 0.14;
        col += offset[1] + (token > 1 ? 0.14 : 0);
      } else if (position >= 0) {
        const key = `${row}-${col}`;
        const stack = occupied.get(key) ?? 0;
        occupied.set(key, stack + 1);
        row += stack > 1 ? 0.18 : 0;
        col += stack % 2 === 1 ? 0.18 : stack > 1 ? -0.18 : 0;
      }

      pawns.push({
        player,
        token,
        row,
        col,
        movable: player === state.turn && legal.has(token),
      });
    });
  });

  return (
    <div className="ludo-board-wrap" aria-label="Tabuleiro de Ludo">
      <img
        src={boardAsset.url}
        alt="Tabuleiro de Ludo"
        className="block h-full w-full select-none"
        draggable={false}
      />
      {pawns.map((pawn) => (
        <button
          key={`${pawn.player}-${pawn.token}`}
          type="button"
          aria-label={`Peão ${pawn.token + 1} do Jogador ${pawn.player + 1}`}
          disabled={disabled || !pawn.movable}
          onClick={() => onMove(pawn.token)}
          className={cn(
            "ludo-pawn",
            PAWN_COLOR_CLASSES[pawn.player],
            pawn.movable && "ludo-pawn-movable",
          )}
          style={{
            left: `${((pawn.col + 0.5) / 15) * 100}%`,
            top: `${((pawn.row + 0.5) / 15) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
