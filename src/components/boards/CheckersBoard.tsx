import { useMemo, useState } from "react";
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
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl border-4 border-border/70">
      {state.board.map((piece, i) => {
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        return (
          <button
            key={i}
            onClick={() => click(i)}
            className={cn(
              "relative flex items-center justify-center p-[10%]",
              dark ? "bg-board-dark" : "bg-board-light",
              from === i && "bg-accent/70",
            )}
          >
            {piece ? (
              <span
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-full text-[3.2vw] font-black shadow-md sm:text-base",
                  piece.p === 0
                    ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900"
                    : "bg-gradient-to-br from-neutral-700 to-neutral-950 text-amber-300",
                )}
              >
                {piece.king ? "♛" : ""}
              </span>
            ) : null}
            {targets.includes(i) ? (
              <span className="absolute h-1/3 w-1/3 rounded-full bg-accent/80" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
