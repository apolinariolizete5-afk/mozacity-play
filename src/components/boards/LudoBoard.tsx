import boardAsset from "@/assets/ludo/board.png.asset.json";
import { Button } from "@/components/ui/primitives";
import { FINISHED, cellFor, movableTokens, type LudoState } from "@/lib/games/ludo";
import { cn } from "@/lib/utils";

const BASE_POINTS: [number, number][][] = [
  [[2, 2], [2, 4], [4, 2], [4, 4]],
  [[2, 10], [2, 12], [4, 10], [4, 12]],
  [[10, 10], [10, 12], [12, 10], [12, 12]],
  [[10, 2], [10, 4], [12, 2], [12, 4]],
];

const TOKEN_CLASSES = ["ludo-token-green", "ludo-token-yellow", "ludo-token-blue", "ludo-token-red"];
const FINISH_OFFSETS: [number, number][] = [[-0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0.2, -0.2]];

interface TokenView {
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
  const tokens: TokenView[] = [];

  state.tokens.forEach((playerTokens, player) => {
    playerTokens.forEach((position, token) => {
      let point: [number, number] | undefined;
      if (position === -1) point = BASE_POINTS[player]?.[token];
      else {
        const cell = cellFor(player, position);
        if (cell) point = cell;
      }
      if (!point) return;

      let [row, col] = point;
      if (position === FINISHED) {
        const offset = FINISH_OFFSETS[player] ?? [0, 0];
        row += offset[0] + (token % 2) * 0.13;
        col += offset[1] + (token > 1 ? 0.13 : 0);
      } else if (position >= 0) {
        const key = `${row}-${col}`;
        const stack = occupied.get(key) ?? 0;
        occupied.set(key, stack + 1);
        row += stack > 1 ? 0.18 : 0;
        col += stack % 2 === 1 ? 0.18 : stack > 1 ? -0.18 : 0;
      }

      tokens.push({ player, token, row, col, movable: player === state.turn && legal.has(token) });
    });
  });

  return (
    <div className="ludo-board-wrap" aria-label="Tabuleiro de Ludo">
      <img src={boardAsset.url} alt="Tabuleiro clássico de Ludo" className="block h-full w-full select-none" draggable={false} />
      {tokens.map((piece) => (
        <Button
          key={`${piece.player}-${piece.token}`}
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Mover peão ${piece.token + 1}`}
          disabled={disabled || !piece.movable}
          onClick={() => onMove(piece.token)}
          className={cn(
            "ludo-token absolute z-10 h-auto min-h-0 w-auto min-w-0 rounded-full p-0",
            TOKEN_CLASSES[piece.player],
            piece.movable && "ludo-token-movable",
          )}
          style={{
            left: `${((piece.col + 0.5) / 15) * 100}%`,
            top: `${((piece.row + 0.5) / 15) * 100}%`,
          }}
        >
          <span className="sr-only">Peão</span>
        </Button>
      ))}
    </div>
  );
}