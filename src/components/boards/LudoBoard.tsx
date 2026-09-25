import { FINISHED, SAFE_STEPS, cellFor, movableTokens, type LudoState } from "@/lib/games/ludo";
import { cn } from "@/lib/utils";


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

const BASE_POINTS: [number, number][][] = [
  [[2, 2], [2, 4], [4, 2], [4, 4]],
  [[2, 10], [2, 12], [4, 10], [4, 12]],
  [[10, 10], [10, 12], [12, 10], [12, 12]],
  [[10, 2], [10, 4], [12, 2], [12, 4]],
];

const PAWN_COLOR_CLASSES = [
  "ludo-pawn-green",
  "ludo-pawn-yellow",
  "ludo-pawn-blue",
  "ludo-pawn-red",
];

const PLAYER_ZONE_CLASSES = [
  "ludo-zone-green",
  "ludo-zone-yellow",
  "ludo-zone-blue",
  "ludo-zone-red",
];

const HOME_LANES: [number, number][][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
];

interface PawnView {
  player: number;
  token: number;
  row: number;
  col: number;
  movable: boolean;
}

const keyOf = (row: number, col: number) => `${row}-${col}`;

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
  const ringSet = new Set(RING_PATH.map(([row, col]) => keyOf(row, col)));
  const homeLaneMap = new Map<string, number>();

  HOME_LANES.forEach((lane, player) => {
    lane.forEach(([row, col]) => homeLaneMap.set(keyOf(row, col), player));
  });

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
        row = 7 + (token < 2 ? -0.55 : 0.55);
        col = 7 + (token % 2 === 0 ? -0.55 : 0.55);
      } else if (position >= 0) {
        const key = keyOf(row, col);
        const stack = occupied.get(key) ?? 0;
        occupied.set(key, stack + 1);
        row += stack > 1 ? 0.16 : 0;
        col += stack % 2 === 1 ? 0.16 : stack > 1 ? -0.16 : 0;
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
      <div className="ludo-board-grid" aria-hidden="true">
        {Array.from({ length: 225 }, (_, index) => {
          const row = Math.floor(index / 15);
          const col = index % 15;
          const key = keyOf(row, col);
          const zone =
            row <= 5 && col <= 5 ? 0 :
            row <= 5 && col >= 9 ? 1 :
            row >= 9 && col >= 9 ? 2 :
            row >= 9 && col <= 5 ? 3 :
            null;
          const homePlayer = homeLaneMap.get(key);
          const ring = ringSet.has(key);
          const ringIndex = ring
            ? RING_PATH.findIndex(([r, c]) => r === row && c === col)
            : -1;
          const safe = ring && SAFE_STEPS.has(ringIndex);
          const isStart = [0, 1, 2, 3].some((player) => {
            const point = cellFor(player, 0);
            return point?.[0] === row && point?.[1] === col;
          });

          return (
            <div
              key={key}
              className={cn(
                "ludo-cell",
                zone != null && PLAYER_ZONE_CLASSES[zone],
                ring && "ludo-path-cell",
                homePlayer != null && PLAYER_ZONE_CLASSES[homePlayer],
                safe && "ludo-safe-cell",
                isStart && "ludo-start-cell",
              )}
            >
              {safe && <span className="ludo-star">★</span>}
            </div>
          );
        })}
      </div>

      <div className="ludo-yard ludo-yard-green"><span /></div>
      <div className="ludo-yard ludo-yard-yellow"><span /></div>
      <div className="ludo-yard ludo-yard-blue"><span /></div>
      <div className="ludo-yard ludo-yard-red"><span /></div>

      <div className="ludo-center" aria-hidden="true">
        <div className="ludo-center-green" />
        <div className="ludo-center-yellow" />
        <div className="ludo-center-blue" />
        <div className="ludo-center-red" />
        <div className="ludo-center-core" />
      </div>

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
