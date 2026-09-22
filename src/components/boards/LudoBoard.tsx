import {
  FINISHED,
  LUDO_COLORS,
  RING,
  SAFE_STEPS,
  cellFor,
  movableTokens,
  ringCell,
  type LudoState,
} from "@/lib/games/ludo";
import { cn } from "@/lib/utils";

interface TokenView {
  player: number;
  token: number;
  row: number;
  col: number;
  movable: boolean;
}

export function LudoBoard({
  state,
  onPick,
  disabled,
}: {
  state: LudoState;
  onPick: (token: number) => void;
  disabled?: boolean;
}) {
  const movable = disabled ? [] : movableTokens(state);

  const tokens: TokenView[] = [];
  for (let p = 0; p < state.players; p++) {
    state.tokens[p]!.forEach((pos, t) => {
      const cell = cellFor(p, pos);
      if (!cell) return;
      tokens.push({
        player: p,
        token: t,
        row: cell[0],
        col: cell[1],
        movable: p === state.turn && movable.includes(t),
      });
    });
  }

  const trackCells = new Set<string>();
  for (let step = 0; step < RING; step++) {
    const [r, c] = ringCell(0, step);
    trackCells.add(`${r}-${c}`);
  }
  for (let p = 0; p < 4; p++) {
    for (let h = RING; h < FINISHED; h++) {
      const cell = cellFor(p, h)!;
      trackCells.add(`${cell[0]}-${cell[1]}`);
    }
  }

  const startCells = new Map<string, number>();
  for (let p = 0; p < 4; p++) {
    const [r, c] = ringCell(p, 0);
    startCells.set(`${r}-${c}`, p);
  }
  const homeOwner = new Map<string, number>();
  for (let p = 0; p < 4; p++) {
    for (let h = RING; h < FINISHED; h++) {
      const cell = cellFor(p, h)!;
      homeOwner.set(`${cell[0]}-${cell[1]}`, p);
    }
  }

  const baseQuadrant = (r: number, c: number): number | null => {
    if (r < 6 && c < 6) return 0;
    if (r < 6 && c > 8) return 1;
    if (r > 8 && c > 8) return 2;
    if (r > 8 && c < 6) return 3;
    return null;
  };

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl border-4 border-border/70 bg-[oklch(0.24_0.02_258)] p-1">
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
          gridTemplateRows: "repeat(15, minmax(0, 1fr))",
        }}
      >
        {Array.from({ length: 225 }, (_, i) => {
          const r = Math.floor(i / 15);
          const c = i % 15;
          const key = `${r}-${c}`;
          const isTrack = trackCells.has(key);
          const start = startCells.get(key);
          const home = homeOwner.get(key);
          const quad = baseQuadrant(r, c);
          const center = r === 7 && c === 7;
          const safeStart = start !== undefined && SAFE_STEPS.has(0);
          return (
            <div
              key={i}
              className={cn(
                "border border-black/15",
                isTrack ? "bg-[oklch(0.93_0.01_250)]" : "bg-transparent",
                quad !== null && "bg-[oklch(0.28_0.02_258)]",
                center && "bg-primary/80",
              )}
              style={{
                backgroundColor:
                  home !== undefined
                    ? LUDO_COLORS[home]
                    : safeStart && start !== undefined
                      ? LUDO_COLORS[start]
                      : undefined,
              }}
            />
          );
        })}
      </div>

      {/* base pads */}
      {[
        [1, 1],
        [1, 10],
        [10, 10],
        [10, 1],
      ].map(([r, c], p) => (
        <div
          key={p}
          className="pointer-events-none absolute rounded-2xl border-2 opacity-70"
          style={{
            top: `${(r! / 15) * 100}%`,
            left: `${(c! / 15) * 100}%`,
            width: `${(4 / 15) * 100}%`,
            height: `${(4 / 15) * 100}%`,
            borderColor: LUDO_COLORS[p],
          }}
        />
      ))}

      {/* base tokens */}
      {Array.from({ length: state.players }, (_, p) => {
        const pads: [number, number][] = [
          [1, 1],
          [1, 10],
          [10, 10],
          [10, 1],
        ];
        const [br, bc] = pads[p]!;
        return state.tokens[p]!.map((pos, t) => {
          if (pos !== -1) return null;
          const r = br + (t < 2 ? 0 : 2);
          const c = bc + (t % 2 === 0 ? 0 : 2);
          const isMovable = p === state.turn && movable.includes(t);
          return (
            <Token
              key={`base-${p}-${t}`}
              row={r}
              col={c}
              player={p}
              movable={isMovable}
              onClick={() => isMovable && onPick(t)}
            />
          );
        });
      })}

      {/* tokens on track */}
      {tokens.map((tk) => (
        <Token
          key={`tk-${tk.player}-${tk.token}`}
          row={tk.row}
          col={tk.col}
          player={tk.player}
          movable={tk.movable}
          onClick={() => tk.movable && onPick(tk.token)}
        />
      ))}
    </div>
  );
}

function Token({
  row,
  col,
  player,
  movable,
  onClick,
}: {
  row: number;
  col: number;
  player: number;
  movable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`Peça ${player + 1}`}
      className={cn(
        "absolute rounded-full border-2 border-black/50 shadow-md transition-transform",
        movable && "z-10 scale-110 ring-2 ring-white animate-pulse",
      )}
      style={{
        backgroundColor: LUDO_COLORS[player],
        top: `calc(${(row / 15) * 100}% + 1px)`,
        left: `calc(${(col / 15) * 100}% + 1px)`,
        width: `calc(${(1 / 15) * 100}% - 3px)`,
        height: `calc(${(1 / 15) * 100}% - 3px)`,
      }}
    />
  );
}
