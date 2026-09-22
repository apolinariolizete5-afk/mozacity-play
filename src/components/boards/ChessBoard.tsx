import { useMemo, useState } from "react";
import { PIECE_GLYPH, legalMoves, type ChessMove, type ChessState } from "@/lib/games/chess";
import { cn } from "@/lib/utils";

export function ChessBoard({
  state,
  onMove,
  disabled,
}: {
  state: ChessState;
  onMove: (move: ChessMove) => void;
  disabled?: boolean;
}) {
  const [from, setFrom] = useState<number | null>(null);
  const moves = useMemo(() => legalMoves(state), [state]);
  const targets = from === null ? [] : moves.filter((m) => m.from === from).map((m) => m.to);

  const click = (square: number) => {
    if (disabled) return;
    if (from !== null && targets.includes(square)) {
      const move = moves.find((m) => m.from === from && m.to === square)!;
      onMove(move.promo ? { ...move, promo: "q" } : move);
      setFrom(null);
      return;
    }
    const piece = state.board[square];
    setFrom(piece && piece.c === state.turn ? square : null);
  };

  return (
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl border-4 border-border/70">
      {state.board.map((piece, i) => {
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        const isTarget = targets.includes(i);
        const last = state.lastMove && (state.lastMove.from === i || state.lastMove.to === i);
        return (
          <button
            key={i}
            onClick={() => click(i)}
            className={cn(
              "relative flex items-center justify-center text-[7vw] leading-none sm:text-3xl",
              dark ? "bg-board-dark" : "bg-board-light",
              last && "ring-2 ring-inset ring-primary/70",
              from === i && "bg-accent/70",
            )}
          >
            {piece ? (
              <span className={piece.c === "w" ? "text-white drop-shadow" : "text-neutral-900"}>
                {PIECE_GLYPH[`${piece.c}${piece.t}`]}
              </span>
            ) : null}
            {isTarget ? (
              <span
                className={cn(
                  "absolute rounded-full bg-accent/80",
                  piece ? "inset-1 rounded-xl bg-destructive/50" : "h-1/4 w-1/4",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
