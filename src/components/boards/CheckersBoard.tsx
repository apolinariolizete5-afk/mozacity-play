import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { legalMoves, type CheckersMove, type CheckersState } from "@/lib/games/checkers";
import { cn } from "@/lib/utils";

export function CheckersBoard({
  state,
  onMove,
  disabled,
}: {
  state: CheckersState;
  onMove: (move: CheckersMove) => void;
  disabled?: boolean;
}) {
  const [from, setFrom] = useState<number | null>(null);
  const moves = useMemo(() => legalMoves(state), [state]);
  const targets = from === null ? [] : moves.filter((m) => m.from === from).map((m) => m.to);
  const lastMove = state.lastMove;

  // Clear a stale selection after a remote move, turn change, or forced capture.
  useEffect(() => {
    if (from === null) return;
    const selectedPiece = state.board[from];
    if (
      !selectedPiece ||
      selectedPiece.p !== state.turn ||
      !moves.some((move) => move.from === from)
    ) {
      setFrom(null);
    }
  }, [from, state, moves]);

  const click = (square: number) => {
    if (disabled) return;
    if (from !== null && targets.includes(square)) {
      onMove({ from, to: square });
      setFrom(null);
      return;
    }
    const piece = state.board[square];
    const selectable = piece && piece.p === state.turn && moves.some((m) => m.from === square);
    setFrom(selectable ? square : null);
  };

  return (
    <>
      <style>{`
        @keyframes checkers-piece-arrive {
          from {
            transform: translate(calc(var(--move-x) * 100%), calc(var(--move-y) * 100%)) scale(.78);
            opacity: .45;
          }
          65% { transform: translate(0, 0) scale(1.05); opacity: 1; }
          to { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        .checkers-piece-arrive { animation: checkers-piece-arrive 260ms cubic-bezier(.2,.8,.2,1); }
      `}</style>

      <div className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border-4 border-border/70">
        {state.board.map((piece, i) => {
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const arriving = Boolean(piece && lastMove?.to === i);
          const moveStyle: CSSProperties | undefined = arriving
            ? {
                "--move-x": String(Math.floor(lastMove!.from % 8) - Math.floor(lastMove!.to % 8)),
                "--move-y": String(Math.floor(lastMove!.from / 8) - Math.floor(lastMove!.to / 8)),
              } as CSSProperties
            : undefined;

          return (
            <button
              key={i}
              type="button"
              disabled={Boolean(disabled)}
              aria-label={`Casa ${Math.floor(i / 8) + 1}, ${(i % 8) + 1}${piece ? piece.p === 0 ? ", peça clara" : ", peça escura" : ""}${piece?.king ? ", dama" : ""}`}
              onClick={() => click(i)}
              className={cn(
                "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-0 transition-colors",
                dark ? "bg-board-dark" : "bg-board-light",
                from === i && "bg-accent/70",
              )}
            >
              {piece ? (
                <span
                  key={`piece-${i}-${piece.p}-${piece.king ? "k" : "m"}-${lastMove?.from ?? "n"}-${lastMove?.to ?? "n"}`}
                  style={moveStyle}
                  className={cn(
                    "flex aspect-square w-[78%] shrink-0 items-center justify-center rounded-full text-[clamp(0.55rem,2.6vw,1rem)] font-black shadow-md",
                    piece.p === 0
                      ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900"
                      : "bg-gradient-to-br from-neutral-700 to-neutral-950 text-amber-300",
                    arriving && "checkers-piece-arrive",
                  )}
                >
                  {piece.king ? "♛" : ""}
                </span>
              ) : null}
              {targets.includes(i) ? (
                <span className="absolute h-1/3 w-1/3 rounded-full bg-accent/80 animate-pulse" />
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
