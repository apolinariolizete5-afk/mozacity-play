import {
  FINISHED,
  LUDO_COLORS,
  LUDO_BG_COLORS,
  RING,
  SAFE_STEPS,
  cellFor,
  movableTokens,
  ringCell,
  type LudoState,
} from "@/lib/games/ludo";
import { cn } from "@/lib/utils";
import { Sparkles, Star } from "lucide-react";

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

  const starCells = new Set<string>();
  SAFE_STEPS.forEach((step) => {
    const [r, c] = ringCell(0, step);
    starCells.add(`${r}-${c}`);
  });

  const baseQuadrant = (r: number, c: number): number | null => {
    if (r < 6 && c < 6) return 0;
    if (r < 6 && c > 8) return 1;
    if (r > 8 && c > 8) return 2;
    if (r > 8 && c < 6) return 3;
    return null;
  };

  return (
    <div className="relative aspect-square w-full select-none overflow-hidden rounded-3xl border-4 border-slate-800 bg-slate-900 p-2 shadow-2xl shadow-black/60">
      <div
        className="grid h-full w-full rounded-2xl bg-slate-100 shadow-inner"
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
          const isStar = starCells.has(key);
          const center = r === 7 && c === 7;

          return (
            <div
              key={i}
              className={cn(
                "relative flex items-center justify-center border-[0.5px] border-slate-300 transition-colors",
                isTrack && "bg-amber-50/90",
                quad !== null && "bg-transparent border-transparent",
                center && "bg-gradient-to-br from-amber-400 via-rose-500 to-indigo-600 shadow-inner",
              )}
              style={{
                backgroundColor:
                  home !== undefined
                    ? LUDO_COLORS[home]
                    : start !== undefined
                    ? LUDO_COLORS[start]
                    : undefined,
              }}
            >
              {isStar && !center && (
                <Star className="h-3 w-3 fill-amber-400 text-amber-500 drop-shadow" />
              )}
              {center && (
                <Sparkles className="h-4 w-4 text-white animate-spin duration-1000" />
              )}
            </div>
          );
        })}
      </div>

      {[
        { r: 0, c: 0, p: 0 },
        { r: 0, c: 9, p: 1 },
        { r: 9, c: 9, p: 2 },
        { r: 9, c: 0, p: 3 },
      ].map(({ r, c, p }) => (
        <div
          key={p}
          className="absolute rounded-2xl p-2.5 shadow-md transition-all"
          style={{
            top: `${(r / 15) * 100}%`,
            left: `${(c / 15) * 100}%`,
            width: `${(6 / 15) * 100}%`,
            height: `${(6 / 15) * 100}%`,
            backgroundColor: LUDO_COLORS[p],
          }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-white/90 p-2 shadow-inner">
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2">
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className="rounded-full border-2 border-dashed shadow-inner flex items-center justify-center"
                  style={{
                    borderColor: LUDO_COLORS[p],
                    backgroundColor: LUDO_BG_COLORS[p],
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {Array.from({ length: state.players }, (_, p) => {
        const nestOffsets: [number, number][] = [
          [1.5, 1.5],
          [1.5, 10.5],
          [10.5, 10.5],
          [10.5, 1.5],
        ];
        const [br, bc] = nestOffsets[p]!;
        return state.tokens[p]!.map((pos, t) => {
          if (pos !== -1) return null;
          const r = br + (t < 2 ? 0 : 2);
          const c = bc + (t % 2 === 0 ? 0 : 2);
          const isMovable = p === state.turn && movable.includes(t);

          return (
            <button
              key={`base-${p}-${t}`}
              type="button"
              disabled={!isMovable}
              onClick={() => onPick(t)}
              className={cn(
                "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform",
                isMovable
                  ? "cursor-pointer ring-4 ring-amber-400 ring-offset-2 animate-bounce scale-110"
                  : "cursor-default opacity-90",
              )}
              style={{
                top: `${((r + 0.5) / 15) * 100}%`,
                left: `${((c + 0.5) / 15) * 100}%`,
                width: `${(1 / 15) * 100}%`,
                height: `${(1 / 15) * 100}%`,
              }}
            >
              <div
                className="h-7 w-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-bold text-xs text-white"
                style={{
                  backgroundColor: LUDO_COLORS[p],
                  boxShadow: `0 4px 10px ${LUDO_COLORS[p]}88`,
                }}
              >
                ●
              </div>
            </button>
          );
        });
      })}

      {tokens.map((t) => (
        <button
          key={`token-${t.player}-${t.token}`}
          type="button"
          disabled={!t.movable}
          onClick={() => onPick(t.token)}
          className={cn(
            "absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-300",
            t.movable
              ? "cursor-pointer ring-4 ring-amber-400 ring-offset-1 animate-pulse scale-125 z-30"
              : "cursor-default",
          )}
          style={{
            top: `${((t.row + 0.5) / 15) * 100}%`,
            left: `${((t.col + 0.5) / 15) * 100}%`,
            width: `${(1 / 15) * 100}%`,
            height: `${(1 / 15) * 100}%`,
          }}
        >
          <div
            className="h-6 w-6 rounded-full border-2 border-white shadow-xl flex items-center justify-center font-black text-xs text-white"
            style={{
              backgroundColor: LUDO_COLORS[t.player],
              boxShadow: `0 3px 8px ${LUDO_COLORS[t.player]}99`,
            }}
          >
            {t.token + 1}
          </div>
        </button>
      ))}
    </div>
  );
}
